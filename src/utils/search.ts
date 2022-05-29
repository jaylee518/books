import { t } from 'fyo';
import { RawValueMap } from 'fyo/core/types';
import { groupBy } from 'lodash';
import { ModelNameEnum } from 'models/types';
import { reports } from 'reports';
import { OptionField } from 'schemas/types';
import { fyo } from 'src/initFyo';
import { getEntryRoute } from 'src/router';
import { GetAllOptions } from 'utils/db/types';
import { fuzzyMatch } from '.';
import { routeTo } from './ui';

export const searchGroups = ['Docs', 'List', 'Create', 'Report', 'Page'];
enum SearchGroupEnum {
  'List' = 'List',
  'Report' = 'Report',
  'Create' = 'Create',
  'Page' = 'Page',
  'Docs' = 'Docs',
}

type SearchGroup = keyof typeof SearchGroupEnum;
interface SearchItem {
  label: string;
  group: SearchGroup;
  route?: string;
  action?: () => void;
}

interface DocSearchItem extends SearchItem {
  schemaLabel: string;
  more: string[];
}

type SearchItems = (DocSearchItem | SearchItem)[];

interface Searchable {
  needsUpdate: boolean;
  schemaName: string;
  fields: string[];
  meta: string[];
  isChild: boolean;
  isSubmittable: boolean;
}

interface Keyword {
  values: string[];
  meta: Record<string, string | boolean | undefined>;
  priority: number;
}

interface SearchFilters {
  groupFilters: Record<SearchGroup, boolean>;
  skipTables: boolean;
  skipTransactions: boolean;
  schemaFilters: Record<string, boolean>;
}

interface SearchIntermediate {
  suggestions: SearchItems;
  previousInput?: string;
}

export function getGroupLabelMap() {
  return {
    Create: t`Create`,
    List: t`List`,
    Report: t`Report`,
    Docs: t`Docs`,
    Page: t`Page`,
  };
}

async function openQuickEditDoc(schemaName: string) {
  await routeTo(`/list/${schemaName}`);
  const doc = await fyo.doc.getNewDoc(schemaName);
  const { openQuickEdit } = await import('src/utils/ui');

  await openQuickEdit({
    schemaName,
    name: doc.name as string,
  });
}

async function openFormEditDoc(schemaName: string) {
  const doc = fyo.doc.getNewDoc(schemaName);
  const name = doc.name;

  routeTo(`/edit/${schemaName}/${name}`);
}

function getCreateList(): SearchItem[] {
  const quickEditCreateList = [
    ModelNameEnum.Item,
    ModelNameEnum.Party,
    ModelNameEnum.Payment,
  ].map(
    (schemaName) =>
      ({
        label: fyo.schemaMap[schemaName]?.label,
        group: 'Create',
        action() {
          openQuickEditDoc(schemaName);
        },
      } as SearchItem)
  );

  const formEditCreateList = [
    ModelNameEnum.SalesInvoice,
    ModelNameEnum.PurchaseInvoice,
    ModelNameEnum.JournalEntry,
  ].map(
    (schemaName) =>
      ({
        label: fyo.schemaMap[schemaName]?.label,
        group: 'Create',
        action() {
          openFormEditDoc(schemaName);
        },
      } as SearchItem)
  );

  const filteredCreateList = [
    {
      label: t`Customers`,
      schemaName: ModelNameEnum.Party,
      filter: { role: 'Customer' },
    },
    {
      label: t`Suppliers`,
      schemaName: ModelNameEnum.Party,
      filter: { role: 'Supplier' },
    },
    {
      label: t`Sales Items`,
      schemaName: ModelNameEnum.Item,
      filter: { for: 'Sales' },
    },
    {
      label: t`Purchase Items`,
      schemaName: ModelNameEnum.Item,
      filter: { for: 'Purchases' },
    },
    {
      label: t`Common Items`,
      schemaName: ModelNameEnum.Item,
      filter: { for: 'Both' },
    },
  ].map(({ label, filter, schemaName }) => {
    const fk = Object.keys(filter)[0] as 'for' | 'role';
    const ep = `${fk}/${filter[fk]}`;

    const route = `/list/${schemaName}/${ep}/${label}`;
    return {
      label,
      group: 'Create',
      async action() {
        await routeTo(route);
        const doc = await fyo.doc.getNewDoc(schemaName, filter);
        const { openQuickEdit } = await import('src/utils/ui');
        await openQuickEdit({
          schemaName,
          name: doc.name as string,
        });
      },
    } as SearchItem;
  });

  return [quickEditCreateList, formEditCreateList, filteredCreateList].flat();
}

function getReportList(): SearchItem[] {
  const hasGstin = !!fyo.singles?.AccountingSettings?.gstin;
  return Object.keys(reports)
    .filter((r) => {
      const report = reports[r];
      if (report.title.startsWith('GST') && !hasGstin) {
        return false;
      }
      return true;
    })
    .map((r) => {
      const report = reports[r];
      return {
        label: report.title,
        route: `/report/${r}`,
        group: 'Report',
      };
    });
}

function getListViewList(): SearchItem[] {
  let schemaNames = [
    ModelNameEnum.Account,
    ModelNameEnum.Party,
    ModelNameEnum.Payment,
    ModelNameEnum.JournalEntry,
    ModelNameEnum.PurchaseInvoice,
    ModelNameEnum.SalesInvoice,
    ModelNameEnum.Tax,
  ];

  if (fyo.store.isDevelopment) {
    schemaNames = Object.keys(fyo.schemaMap) as ModelNameEnum[];
  }
  const standardLists = schemaNames
    .map((s) => fyo.schemaMap[s])
    .filter((s) => s && !s.isChild && !s.isSingle)
    .map(
      (s) =>
        ({
          label: s!.label,
          route: `/list/${s!.name}`,
          group: 'List',
        } as SearchItem)
    );

  const filteredLists = [
    { label: t`Customers`, route: `/list/Party/role/Customer/${t`Customers`}` },
    { label: t`Suppliers`, route: `/list/Party/role/Supplier/${t`Suppliers`}` },
    {
      label: t`Sales Items`,
      route: `/list/Item/for/Sales/${t`Sales Items`}`,
    },
    {
      label: t`Sales Payments`,
      route: `/list/Payment/paymentType/Receive/${t`Sales Payments`}`,
    },
    {
      label: t`Purchase Items`,
      route: `/list/Item/for/Purchases/${t`Purchase Items`}`,
    },
    {
      label: t`Common Items`,
      route: `/list/Item/for/Both/${t`Common Items`}`,
    },
    {
      label: t`Purchase Payments`,
      route: `/list/Payment/paymentType/Pay/${t`Purchase Payments`}`,
    },
  ].map((i) => ({ ...i, group: 'List' } as SearchItem));

  return [standardLists, filteredLists].flat();
}

function getSetupList(): SearchItem[] {
  return [
    {
      label: t`Dashboard`,
      route: '/',
      group: 'Page',
    },
    {
      label: t`Chart of Accounts`,
      route: '/chart-of-accounts',
      group: 'Page',
    },
    {
      label: t`Data Import`,
      route: '/data-import',
      group: 'Page',
    },
    {
      label: t`Settings`,
      route: '/settings',
      group: 'Page',
    },
  ];
}

function getNonDocSearchList() {
  return [getListViewList(), getCreateList(), getReportList(), getSetupList()]
    .flat()
    .map((d) => {
      if (d.route && !d.action) {
        d.action = () => {
          routeTo(d.route!);
        };
      }
      return d;
    });
}

class Search {
  _obsSet: boolean = false;
  searchables: Record<string, Searchable>;
  keywords: Record<string, Keyword[]>;
  priorityMap: Record<string, number> = {
    [ModelNameEnum.SalesInvoice]: 125,
    [ModelNameEnum.PurchaseInvoice]: 100,
    [ModelNameEnum.Payment]: 75,
    [ModelNameEnum.Item]: 50,
    [ModelNameEnum.Party]: 50,
    [ModelNameEnum.JournalEntry]: 50,
  };

  filters: SearchFilters = {
    groupFilters: {
      List: true,
      Report: true,
      Create: true,
      Page: true,
      Docs: true,
    },
    schemaFilters: {},
    skipTables: false,
    skipTransactions: false,
  };

  _intermediate: SearchIntermediate = { suggestions: [] };

  _nonDocSearchList: SearchItem[];
  _groupLabelMap?: Record<SearchGroup, string>;

  constructor() {
    this.keywords = {};
    this.searchables = {};
    this._nonDocSearchList = getNonDocSearchList();
  }

  async initializeKeywords() {
    this._setSearchables();
    await this.updateKeywords();
    this._setDocObservers();
    this._setSchemaFilters();
    this._groupLabelMap = getGroupLabelMap();
  }

  _setSchemaFilters() {
    for (const name in this.searchables) {
      this.filters.schemaFilters[name] = true;
    }
  }

  async updateKeywords() {
    for (const searchable of Object.values(this.searchables)) {
      if (!searchable.needsUpdate) {
        continue;
      }

      const options: GetAllOptions = {
        fields: [searchable.fields, searchable.meta].flat(),
        order: 'desc',
      };

      if (!searchable.isChild) {
        options.orderBy = 'modified';
      }

      const maps = await fyo.db.getAllRaw(searchable.schemaName, options);
      this._setKeywords(maps, searchable);
      this.searchables[searchable.schemaName].needsUpdate = false;
    }
  }

  searchSuggestions(input: string): SearchItems {
    const matches: { si: SearchItem | DocSearchItem; distance: number }[] = [];

    for (const si of this._intermediate.suggestions) {
      const label = si.label;
      const groupLabel =
        (si as DocSearchItem).schemaLabel || this._groupLabelMap![si.group];
      const more = (si as DocSearchItem).more ?? [];
      const values = [label, more, groupLabel].flat();

      const { isMatch, distance } = this._getMatchAndDistance(input, values);

      if (isMatch) {
        matches.push({ si, distance });
      }
    }

    matches.sort((a, b) => a.distance - b.distance);
    const suggestions = matches.map((m) => m.si);
    console.log('here', suggestions.length, input);
    this.setIntermediate(suggestions, input);
    return suggestions;
  }

  shouldUseSuggestions(input?: string): boolean {
    if (!input) {
      return false;
    }

    const { suggestions, previousInput } = this._intermediate;
    if (!suggestions?.length || !previousInput) {
      return false;
    }

    if (!input.startsWith(previousInput)) {
      return false;
    }

    return true;
  }

  setIntermediate(suggestions: SearchItems, previousInput?: string) {
    this._intermediate.suggestions = suggestions;
    this._intermediate.previousInput = previousInput;
  }

  search(input?: string): SearchItems {
    const useSuggestions = this.shouldUseSuggestions(input);
    /*
    console.log(
      input,
      this._intermediate.previousInput,
      useSuggestions,
      this._intermediate.suggestions.length
    );
    */

    /**
     * If the suggestion list is already populated
     * and the input is an extention of the previous
     * then use the suggestions.
     */
    if (useSuggestions) {
      // return this.searchSuggestions(input!);
    } else {
      this.setIntermediate([]);
    }

    /**
     * Create the suggestion list.
     */
    const groupedKeywords = this._getGroupedKeywords();
    const keys = Object.keys(groupedKeywords);
    if (!keys.includes('0')) {
      keys.push('0');
    }

    keys.sort((a, b) => parseFloat(b) - parseFloat(a));
    const array: SearchItems = [];
    for (const key of keys) {
      this._pushDocSearchItems(groupedKeywords[key], array, input);
      if (key === '0') {
        this._pushNonDocSearchItems(array, input);
      }
    }

    this.setIntermediate(array, input);
    return array;
  }

  _pushDocSearchItems(keywords: Keyword[], array: SearchItems, input?: string) {
    if (!input) {
      return;
    }

    if (!this.filters.groupFilters.Docs) {
      return;
    }

    const subArray = this._getSubSortedArray(
      keywords,
      input
    ) as DocSearchItem[];
    array.push(...subArray);
  }

  _pushNonDocSearchItems(array: SearchItems, input?: string) {
    const filtered = this._nonDocSearchList.filter(
      (si) => this.filters.groupFilters[si.group]
    );
    const subArray = this._getSubSortedArray(filtered, input) as SearchItem[];
    array.push(...subArray);
  }

  _getSubSortedArray(
    items: (SearchItem | Keyword)[],
    input?: string
  ): SearchItems {
    const subArray: { item: SearchItem | DocSearchItem; distance: number }[] =
      [];

    for (const item of items) {
      const isSearchItem = !!(item as SearchItem).group;

      if (!input && isSearchItem) {
        subArray.push({ item: item as SearchItem, distance: 0 });
        continue;
      }

      if (!input) {
        continue;
      }

      const values = this._getValueList(item).filter(Boolean);
      const { isMatch, distance } = this._getMatchAndDistance(input, values);

      if (!isMatch) {
        continue;
      }

      if (isSearchItem) {
        subArray.push({ item: item as SearchItem, distance });
      } else {
        subArray.push({
          item: this._getDocSearchItemFromKeyword(item as Keyword),
          distance,
        });
      }
    }

    subArray.sort((a, b) => a.distance - b.distance);
    return subArray.map(({ item }) => item);
  }

  _getMatchAndDistance(input: string, values: string[]) {
    /**
     * All the parts should match with something.
     */

    let distance = Number.MAX_SAFE_INTEGER;
    for (const part of input.split(' ')) {
      const match = this._getInternalMatch(part, values);
      if (!match.isMatch) {
        return { isMatch: false, distance: Number.MAX_SAFE_INTEGER };
      }

      distance = match.distance < distance ? match.distance : distance;
    }

    return { isMatch: true, distance };
  }

  _getInternalMatch(input: string, values: string[]) {
    let isMatch = false;
    let distance = Number.MAX_SAFE_INTEGER;

    for (const k of values) {
      const match = fuzzyMatch(input, k);
      isMatch ||= match.isMatch;

      if (match.distance < distance) {
        distance = match.distance;
      }
    }

    return { isMatch, distance };
  }

  _getValueList(item: SearchItem | Keyword): string[] {
    const { label, group } = item as SearchItem;
    if (group && group !== 'Docs') {
      return [label, group];
    }

    const { values, meta } = item as Keyword;
    const schemaLabel = meta.schemaName as string;
    return [values, schemaLabel].flat();
  }

  _getDocSearchItemFromKeyword(keyword: Keyword): DocSearchItem {
    const schemaName = keyword.meta.schemaName as string;
    const schemaLabel = fyo.schemaMap[schemaName]?.label!;
    const route = this._getRouteFromKeyword(keyword);
    return {
      label: keyword.values[0],
      schemaLabel,
      more: keyword.values.slice(1),
      group: 'Docs',
      action: async () => {
        await routeTo(route);
      },
    };
  }

  _getRouteFromKeyword(keyword: Keyword): string {
    const { parent, parentSchemaName, schemaName } = keyword.meta;
    if (parent && parentSchemaName) {
      return getEntryRoute(parentSchemaName as string, parent as string);
    }

    return getEntryRoute(schemaName as string, keyword.values[0]);
  }

  _getGroupedKeywords() {
    /**
     * filter out the ignored groups
     * group by the keyword priority
     */
    const keywords: Keyword[] = [];
    const schemaNames = Object.keys(this.keywords);
    for (const sn of schemaNames) {
      const searchable = this.searchables[sn];
      if (!this.filters.schemaFilters[sn] || !this.filters.groupFilters.Docs) {
        continue;
      }

      if (searchable.isChild && this.filters.skipTables) {
        continue;
      }

      if (searchable.isSubmittable && this.filters.skipTransactions) {
        continue;
      }
      keywords.push(...this.keywords[sn]);
    }

    return groupBy(keywords.flat(), 'priority');
  }

  _setSearchables() {
    for (const schemaName of Object.keys(fyo.schemaMap)) {
      const schema = fyo.schemaMap[schemaName];
      if (!schema?.keywordFields?.length || this.searchables[schemaName]) {
        continue;
      }

      const fields = [...schema.keywordFields];
      const meta = [];
      if (schema.isChild) {
        meta.push('parent', 'parentSchemaName');
      }

      if (schema.isSubmittable) {
        meta.push('submitted', 'cancelled');
      }

      this.searchables[schemaName] = {
        schemaName,
        fields,
        meta,
        isChild: !!schema.isChild,
        isSubmittable: !!schema.isSubmittable,
        needsUpdate: true,
      };
    }
  }

  _setDocObservers() {
    if (this._obsSet) {
      return;
    }

    for (const { schemaName } of Object.values(this.searchables)) {
      fyo.doc.observer.on(`sync:${schemaName}`, () => {
        this.searchables[schemaName].needsUpdate = true;
      });

      fyo.doc.observer.on(`delete:${schemaName}`, () => {
        this.searchables[schemaName].needsUpdate = true;
      });
    }

    this._obsSet = true;
  }

  _setKeywords(maps: RawValueMap[], searchable: Searchable) {
    if (!maps.length) {
      return;
    }

    this.keywords[searchable.schemaName] = [];

    for (const map of maps) {
      const keyword: Keyword = { values: [], meta: {}, priority: 0 };
      this._setKeywordValues(map, searchable, keyword);
      this._setMeta(map, searchable, keyword);
      this.keywords[searchable.schemaName]!.push(keyword);
    }

    this._setPriority(searchable);
  }

  _setKeywordValues(
    map: RawValueMap,
    searchable: Searchable,
    keyword: Keyword
  ) {
    // Set individual field values
    for (const fn of searchable.fields) {
      let value = map[fn] as string | undefined;
      const field = fyo.getField(searchable.schemaName, fn);

      const { options } = field as OptionField;
      if (options) {
        value = options.find((o) => o.value === value)?.label ?? value;
      }

      keyword.values.push(value ?? '');
    }
  }

  _setMeta(map: RawValueMap, searchable: Searchable, keyword: Keyword) {
    // Set the meta map
    for (const fn of searchable.meta) {
      const meta = map[fn];
      if (typeof meta === 'number') {
        keyword.meta[fn] = Boolean(meta);
      } else if (typeof meta === 'string') {
        keyword.meta[fn] = meta;
      }
    }

    keyword.meta.schemaName = searchable.schemaName;
    if (keyword.meta.parent) {
      keyword.values.unshift(keyword.meta.parent as string);
    }
  }

  _setPriority(searchable: Searchable) {
    const keywords = this.keywords[searchable.schemaName] ?? [];
    const basePriority = this.priorityMap[searchable.schemaName] ?? 0;

    for (const k of keywords) {
      k.priority += basePriority;

      if (k.meta.submitted) {
        k.priority += 25;
      }

      if (k.meta.cancelled) {
        k.priority -= 200;
      }

      if (searchable.isChild) {
        k.priority -= 150;
      }
    }
  }
}

export const searcher = new Search();
