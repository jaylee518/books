import router from '@/router';
import frappe, { t } from 'frappe';
import { h } from 'vue';
import PartyWidget from './PartyWidget.vue';

export default {
  name: 'Supplier',
  label: t`Supplier`,
  basedOn: 'Party',
  filters: {
    supplier: 1,
  },
  actions: [
    {
      label: t`Create Bill`,
      condition: (doc) => !doc.isNew(),
      action: async (supplier) => {
        let doc = await frappe.getEmptyDoc('PurchaseInvoice');
        router.push({
          path: `/edit/PurchaseInvoice/${doc.name}`,
          query: {
            doctype: 'PurchaseInvoice',
            values: {
              supplier: supplier.name,
            },
          },
        });
      },
    },
    {
      label: t`View Bills`,
      condition: (doc) => !doc.isNew(),
      action: (supplier) => {
        router.push({
          name: 'ListView',
          params: {
            doctype: 'PurchaseInvoice',
            filters: {
              supplier: supplier.name,
            },
          },
        });
      },
    },
  ],
  quickEditWidget: (doc) => ({
    render() {
      return h(PartyWidget, {
        doc,
      });
    },
  }),
};
