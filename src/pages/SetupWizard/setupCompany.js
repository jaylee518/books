import config from '@/config';
import frappe from 'frappe';
import { DEFAULT_LOCALE } from 'frappe/utils/consts';
import countryList from '~/fixtures/countryInfo.json';
import importCharts from '../../../accounting/importCOA';
import generateTaxes from '../../../models/doctype/Tax/RegionalEntries';
import regionalModelUpdates from '../../../models/regionalModelUpdates';
import { getId } from '../../telemetry/helpers';
import { callInitializeMoneyMaker } from '../../utils';

export default async function setupCompany(setupWizardValues) {
  const {
    companyLogo,
    companyName,
    country,
    name,
    email,
    bankName,
    currency: companyCurrency,
    fiscalYearStart,
    fiscalYearEnd,
    chartOfAccounts,
  } = setupWizardValues;

  const accountingSettings = frappe.AccountingSettings;
  const currency = companyCurrency || countryList[country]['currency'];
  const locale = countryList[country]['locale'] ?? DEFAULT_LOCALE;
  await callInitializeMoneyMaker(currency);

  const accountingSettingsUpdateMap = {
    companyName,
    country,
    fullname: name,
    email,
    bankName,
    fiscalYearStart,
    fiscalYearEnd,
    currency,
  };

  await accountingSettings.setMultiple(accountingSettingsUpdateMap);
  await accountingSettings.update();

  const printSettings = await frappe.getSingle('PrintSettings');
  const printSettingsUpdateMap = {
    logo: companyLogo,
    companyName,
    email,
    displayLogo: companyLogo ? true : false,
  };

  await printSettings.setMultiple(printSettingsUpdateMap);
  await printSettings.update();

  await setupGlobalCurrencies(countryList);
  await setupChartOfAccounts(bankName, country, chartOfAccounts);
  await setupRegionalChanges(country);
  updateInitializationConfig();

  await accountingSettings.setMultiple({ setupComplete: true });
  await accountingSettings.update();
  frappe.AccountingSettings = accountingSettings;

  const systemSettings = await frappe.getSingle('SystemSettings');
  systemSettings.setMultiple({ locale });
  systemSettings.update();
}

async function setupGlobalCurrencies(countries) {
  const promises = [];
  const queue = [];
  for (let country of Object.values(countries)) {
    const {
      currency,
      currency_fraction: fraction,
      currency_fraction_units: fractionUnits,
      smallest_currency_fraction_value: smallestValue,
      currency_symbol: symbol,
    } = country;

    if (!currency || queue.includes(currency)) {
      continue;
    }

    const docObject = {
      doctype: 'Currency',
      name: currency,
      fraction,
      fractionUnits,
      smallestValue,
      symbol,
    };

    const doc = checkAndCreateDoc(docObject);
    if (doc) {
      promises.push(doc);
      queue.push(currency);
    }
  }
  return Promise.all(promises);
}

async function setupChartOfAccounts(bankName, country, chartOfAccounts) {
  await importCharts(chartOfAccounts);
  const parentAccount = await getBankAccountParentName(country);
  const docObject = {
    doctype: 'Account',
    name: bankName,
    rootType: 'Asset',
    parentAccount,
    accountType: 'Bank',
    isGroup: 0,
  };
  await checkAndCreateDoc(docObject);
}

async function setupRegionalChanges(country) {
  await generateTaxes(country);
  await regionalModelUpdates({ country });
  await frappe.db.migrate();
}

function updateInitializationConfig(language) {
  let filePath = frappe.db.dbPath;
  let files = config.get('files', []);
  files.forEach((file) => {
    if (file.filePath === filePath) {
      file.companyName = frappe.AccountingSettings.companyName;
      file.id = getId();
    }
  });
  config.set('files', files);
}

export async function checkIfExactRecordAbsent(docObject) {
  const { doctype, name } = docObject;
  const newDocObject = Object.assign({}, docObject);
  delete newDocObject.doctype;
  const rows = await frappe.db.getAllRaw(doctype, {
    fields: ['*'],
    filters: { name },
  });

  if (rows.length === 0) {
    return true;
  }

  const storedDocObject = rows[0];
  const matchList = Object.keys(newDocObject).map((key) => {
    const newValue = newDocObject[key];
    const storedValue = storedDocObject[key];
    return newValue == storedValue; // Should not be type sensitive.
  });

  if (!matchList.every(Boolean)) {
    await frappe.db.delete(doctype, name);
    return true;
  }

  return false;
}

async function checkAndCreateDoc(docObject) {
  const canCreate = await checkIfExactRecordAbsent(docObject);
  if (!canCreate) {
    return;
  }

  const doc = await frappe.doc.getNewDoc(docObject.doctype, docObject);
  return doc.insert();
}

async function getBankAccountParentName(country) {
  const parentBankAccount = await frappe.db.getAllRaw('Account', {
    fields: ['*'],
    filters: { isGroup: true, accountType: 'Bank' },
  });

  if (parentBankAccount.length === 0) {
    // This should not happen if the fixtures are correct.
    return 'Bank Accounts';
  } else if (parentBankAccount.length > 1) {
    switch (country) {
      case 'Indonesia':
        return 'Bank Rupiah - 1121.000';
      default:
        break;
    }
  }

  return parentBankAccount[0].name;
}
