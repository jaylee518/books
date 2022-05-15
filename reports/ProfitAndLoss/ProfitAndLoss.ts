import { t } from 'fyo';
import { Action } from 'fyo/model/types';
import { cloneDeep } from 'lodash';
import { DateTime } from 'luxon';
import {
  AccountRootType,
  AccountRootTypeEnum,
} from 'models/baseModels/Account/types';
import { isCredit } from 'models/helpers';
import { ModelNameEnum } from 'models/types';
import { LedgerReport } from 'reports/LedgerReport';
import {
  ColumnField,
  GroupedMap,
  LedgerEntry,
  Periodicity,
} from 'reports/types';
import { Field } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { getMapFromList } from 'utils';
import { QueryFilter } from 'utils/db/types';

type DateRange = { fromDate: DateTime; toDate: DateTime };
type ValueMap = Map<DateRange, number>;
type AccountNameValueMapMap = Map<string, ValueMap>;
type BasedOn = 'Fiscal Year' | 'Date Range';

interface Account {
  name: string;
  rootType: AccountRootType;
  isGroup: boolean;
  parentAccount: string | null;
}

interface AccountTreeNode extends Account {
  children?: AccountTreeNode[];
  valueMap?: ValueMap;
  prune?: boolean;
}
type AccountTree = Record<string, AccountTreeNode>;

const PNL_ROOT_TYPES: AccountRootType[] = [
  AccountRootTypeEnum.Income,
  AccountRootTypeEnum.Expense,
];

export class ProfitAndLoss extends LedgerReport {
  static title = t`Profit And Loss`;
  static reportName = 'profit-and-loss';

  toDate?: string;
  count?: number;
  fromYear?: number;
  toYear?: number;
  singleColumn: boolean = false;
  periodicity: Periodicity = 'Monthly';
  basedOn: BasedOn = 'Date Range';

  _rawData: LedgerEntry[] = [];

  accountMap?: Record<string, Account>;

  async setDefaultFilters(): Promise<void> {
    if (this.basedOn === 'Date Range' && !this.toDate) {
      this.toDate = DateTime.now().toISODate();
      this.count = 3;
    }

    if (this.basedOn === 'Fiscal Year' && !this.toYear) {
      this.fromYear = DateTime.now().year;
      this.toYear = this.fromYear + 1;
    }
  }

  async setReportData(filter?: string) {
    let sort = true;
    if (
      this._rawData.length === 0 &&
      !['periodicity', 'singleColumn'].includes(filter!)
    ) {
      await this._setRawData();
      sort = false;
    }

    const map = this._getGroupedMap(sort, 'account');
    const rangeGroupedMap = await this._getGroupedByDateRanges(map);
    const accountTree = await this._getAccountTree(rangeGroupedMap);

    for (const name of Object.keys(accountTree)) {
      const { rootType } = accountTree[name];
      if (PNL_ROOT_TYPES.includes(rootType)) {
        continue;
      }

      delete accountTree[name];
    }
    /**
     * TODO: Create Grid from rangeGroupedMap and tree
     */
  }

  async temp() {
    await this.setDefaultFilters();
    await this._setRawData();
    const map = this._getGroupedMap(false, 'account');
    const rangeGroupedMap = await this._getGroupedByDateRanges(map);
    const accountTree = await this._getAccountTree(rangeGroupedMap);
    return accountTree;
  }

  async _getGroupedByDateRanges(
    map: GroupedMap
  ): Promise<AccountNameValueMapMap> {
    const dateRanges = await this._getDateRanges();
    const accountValueMap: AccountNameValueMapMap = new Map();
    const accountMap = await this._getAccountMap();

    for (const account of map.keys()) {
      const valueMap: ValueMap = new Map();
      for (const entry of map.get(account)!) {
        const key = this._getRangeMapKey(entry, dateRanges);
        if (key === null) {
          continue;
        }

        const totalBalance = valueMap.get(key!) ?? 0;
        const balance = (entry.debit ?? 0) - (entry.credit ?? 0);
        const rootType = accountMap[entry.account].rootType;

        if (isCredit(rootType)) {
          valueMap.set(key!, totalBalance - balance);
        } else {
          valueMap.set(key!, totalBalance + balance);
        }
      }
      accountValueMap.set(account, valueMap);
    }

    return accountValueMap;
  }

  async _getAccountTree(rangeGroupedMap: AccountNameValueMapMap) {
    const accountTree = cloneDeep(await this._getAccountMap()) as AccountTree;

    setPruneFlagOnAccountTreeNodes(accountTree);
    setValueMapOnAccountTreeNodes(accountTree, rangeGroupedMap);
    setChildrenOnAccountTreeNodes(accountTree);
    deleteNonRootAccountTreeNodes(accountTree);
    pruneAccountTree(accountTree);

    return accountTree;
  }

  async _getAccountMap() {
    if (this.accountMap) {
      return this.accountMap;
    }

    const accountList: Account[] = (
      await this.fyo.db.getAllRaw('Account', {
        fields: ['name', 'rootType', 'isGroup', 'parentAccount'],
      })
    ).map((rv) => ({
      name: rv.name as string,
      rootType: rv.rootType as AccountRootType,
      isGroup: Boolean(rv.isGroup),
      parentAccount: rv.parentAccount as string | null,
    }));

    this.accountMap = getMapFromList(accountList, 'name');
    return this.accountMap;
  }

  _getRangeMapKey(
    entry: LedgerEntry,
    dateRanges: DateRange[]
  ): DateRange | null {
    const entryDate = DateTime.fromISO(
      entry.date!.toISOString().split('T')[0]
    ).toMillis();

    for (const dr of dateRanges) {
      const toDate = dr.toDate.toMillis();
      const fromDate = dr.fromDate.toMillis();

      if (entryDate <= toDate && entryDate > fromDate) {
        return dr;
      }
    }

    return null;
  }

  async _getDateRanges(): Promise<DateRange[]> {
    const endpoints = await this._getFromAndToDates();
    const fromDate = DateTime.fromISO(endpoints.fromDate);
    const toDate = DateTime.fromISO(endpoints.toDate);

    if (this.singleColumn) {
      return [
        {
          toDate,
          fromDate,
        },
      ];
    }

    const months: number = monthsMap[this.periodicity];
    const dateRanges: DateRange[] = [
      { toDate, fromDate: toDate.minus({ months }) },
    ];

    let count = this.count ?? 1;
    if (this.basedOn === 'Fiscal Year') {
      count = Math.ceil(((this.toYear! - this.fromYear!) * 12) / months);
    }

    for (let i = 1; i < count; i++) {
      const lastRange = dateRanges.at(-1)!;
      dateRanges.push({
        toDate: lastRange.fromDate,
        fromDate: lastRange.fromDate.minus({ months }),
      });
    }

    return dateRanges;
  }

  async _getFromAndToDates() {
    let toDate: string;
    let fromDate: string;

    if (this.basedOn === 'Date Range') {
      toDate = this.toDate!;
      const months = monthsMap[this.periodicity] * Math.max(this.count ?? 1, 1);
      fromDate = DateTime.fromISO(toDate).minus({ months }).toISODate();
    } else {
      const fy = await getFiscalEndpoints(this.toYear!, this.fromYear!);
      toDate = fy.toDate;
      fromDate = fy.fromDate;
    }

    return { fromDate, toDate };
  }

  async _getQueryFilters(): Promise<QueryFilter> {
    const filters: QueryFilter = {};
    const { fromDate, toDate } = await this._getFromAndToDates();

    const dateFilter: string[] = [];
    dateFilter.push('<=', toDate);
    dateFilter.push('>=', fromDate);

    filters.date = dateFilter;
    filters.reverted = false;
    return filters;
  }

  getFilters() {
    const periodNameMap: Record<Periodicity, string> = {
      Monthly: t`Months`,
      Quarterly: t`Quarters`,
      'Half Yearly': t`Half Years`,
      Yearly: t`Years`,
    };

    const filters = [
      {
        fieldtype: 'Select',
        options: [
          { label: t`Monthly`, value: 'Monthly' },
          { label: t`Quarterly`, value: 'Quarterly' },
          { label: t`Half Yearly`, value: 'Half Yearly' },
          { label: t`Yearly`, value: 'Yearly' },
        ],
        default: 'Monthly',
        label: t`Periodicity`,
        fieldname: 'periodicity',
      },
      {
        fieldtype: 'Select',
        options: [
          { label: t`Fiscal Year`, value: 'Fiscal Year' },
          { label: t`Date Range`, value: 'Date Range' },
        ],
        default: 'Date Range',
        label: t`Based On`,
        fieldname: 'basedOn',
      },
      {
        fieldtype: 'Check',
        default: false,
        label: t`Single Column`,
        fieldname: 'singleColumn',
      },
    ] as Field[];

    if (this.basedOn === 'Date Range') {
      return [
        ...filters,
        {
          fieldtype: 'Date',
          fieldname: 'toDate',
          placeholder: t`To Date`,
          label: t`To Date`,
          required: true,
        },
        {
          fieldtype: 'Int',
          fieldname: 'count',
          placeholder: t`Number of ${periodNameMap[this.periodicity]}`,
          label: t`Number of ${periodNameMap[this.periodicity]}`,
          required: true,
        },
      ] as Field[];
    }

    const thisYear = DateTime.local().year;
    return [
      ...filters,
      {
        fieldtype: 'Date',
        fieldname: 'fromYear',
        placeholder: t`From Date`,
        label: t`From Date`,
        default: thisYear - 1,
        required: true,
      },
      {
        fieldtype: 'Date',
        fieldname: 'toYear',
        placeholder: t`To Year`,
        label: t`To Year`,
        default: thisYear,
        required: true,
      },
    ] as Field[];
  }

  getColumns(): ColumnField[] {
    const columns = [] as ColumnField[];

    return columns;
  }

  getActions(): Action[] {
    return [];
  }

  metaFilters: string[] = ['basedOn'];
}

async function getFiscalEndpoints(toYear: number, fromYear: number) {
  const fys = (await fyo.getValue(
    ModelNameEnum.AccountingSettings,
    'fiscalYearStart'
  )) as Date;
  const fye = (await fyo.getValue(
    ModelNameEnum.AccountingSettings,
    'fiscalYearEnd'
  )) as Date;

  /**
   * Get the month and the day, and
   * prepend with the passed year.
   */

  const fromDate = [
    fromYear,
    fys.toISOString().split('T')[0].split('-').slice(1),
  ].join('-');

  const toDate = [
    toYear,
    fye.toISOString().split('T')[0].split('-').slice(1),
  ].join('-');

  return { fromDate, toDate };
}

const monthsMap: Record<Periodicity, number> = {
  Monthly: 1,
  Quarterly: 3,
  'Half Yearly': 6,
  Yearly: 12,
};

function setPruneFlagOnAccountTreeNodes(accountTree: AccountTree) {
  for (const account of Object.values(accountTree)) {
    account.prune = true;
  }
}

function setValueMapOnAccountTreeNodes(
  accountTree: AccountTree,
  rangeGroupedMap: AccountNameValueMapMap
) {
  for (const name of rangeGroupedMap.keys()) {
    const valueMap = rangeGroupedMap.get(name)!;
    accountTree[name].valueMap = valueMap;
    accountTree[name].prune = false;

    /**
     * Set the update the parent account values recursively
     * also prevent pruning of the parent accounts.
     */
    let parentAccountName: string | null = accountTree[name].parentAccount;
    let parentValueMap = valueMap;

    while (parentAccountName !== null) {
      const update = updateParentAccountWithChildValues(
        accountTree,
        parentAccountName,
        parentValueMap
      );

      parentAccountName = update.parentAccountName;
      parentValueMap = update.parentValueMap;
    }
  }
}

function updateParentAccountWithChildValues(
  accountTree: AccountTree,
  parentAccountName: string,
  parentValueMap: ValueMap
): {
  parentAccountName: string | null;
  parentValueMap: ValueMap;
} {
  const parentAccount = accountTree[parentAccountName];
  parentAccount.prune = false;
  parentAccount.valueMap ??= new Map();

  for (const key of parentValueMap.keys()) {
    const value = parentAccount.valueMap!.get(key) ?? 0;
    parentAccount.valueMap!.set(key, value + parentValueMap.get(key)!);
  }

  return {
    parentAccountName: parentAccount.parentAccount,
    parentValueMap: parentAccount.valueMap!,
  };
}

function setChildrenOnAccountTreeNodes(accountTree: AccountTree) {
  const parentNodes: Set<string> = new Set();

  for (const name of Object.keys(accountTree)) {
    const ac = accountTree[name];
    if (!ac.parentAccount) {
      continue;
    }

    accountTree[ac.parentAccount].children ??= [];
    accountTree[ac.parentAccount].children!.push(ac!);

    parentNodes.add(ac.parentAccount);
  }
}

function deleteNonRootAccountTreeNodes(accountTree: AccountTree) {
  for (const name of Object.keys(accountTree)) {
    const ac = accountTree[name];
    if (!ac.parentAccount) {
      continue;
    }

    delete accountTree[name];
  }
}

function pruneAccountTree(accountTree: AccountTree) {
  for (const root of Object.keys(accountTree)) {
    if (accountTree[root].prune) {
      delete accountTree[root];
    }
  }

  for (const root of Object.keys(accountTree)) {
    accountTree[root].children = getPrunedChildren(accountTree[root].children!);
  }
}

function getPrunedChildren(children: AccountTreeNode[]): AccountTreeNode[] {
  return children.filter((child) => {
    if (child.children) {
      child.children = getPrunedChildren(child.children);
    }

    return !child.prune;
  });
}

function convertAccountTreeToAccountList() {}
