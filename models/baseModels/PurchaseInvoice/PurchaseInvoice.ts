import { LedgerPosting } from 'accounting/ledgerPosting';
import { Action, ListViewSettings } from 'frappe/model/types';
import {
  getTransactionActions,
  getTransactionStatusColumn,
} from '../../helpers';
import { Invoice } from '../Invoice/Invoice';
import { PurchaseInvoiceItem } from '../PurchaseInvoiceItem/PurchaseInvoiceItem';

export class PurchaseInvoice extends Invoice {
  items?: PurchaseInvoiceItem[];

  async getPosting() {
    const entries: LedgerPosting = new LedgerPosting({
      reference: this,
      party: this.party,
    });

    await entries.credit(this.account!, this.baseGrandTotal!);

    for (const item of this.items!) {
      await entries.debit(item.account!, item.baseAmount!);
    }

    if (this.taxes) {
      for (const tax of this.taxes) {
        await entries.debit(tax.account!, tax.baseAmount!);
      }
    }

    entries.makeRoundOffEntry();
    return entries;
  }

  static actions: Action[] = getTransactionActions('PurchaseInvoice');

  static listSettings: ListViewSettings = {
    formRoute: (name) => `/edit/PurchaseInvoice/${name}`,
    columns: [
      'party',
      'name',
      getTransactionStatusColumn(),
      'date',
      'grandTotal',
      'outstandingAmount',
    ],
  };
}
