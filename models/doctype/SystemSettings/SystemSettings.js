module.exports = {
  name: 'SystemSettings',
  label: 'System Settings',
  doctype: 'DocType',
  isSingle: 1,
  isChild: 0,
  keywordFields: [],
  fields: [
    {
      fieldname: 'dateFormat',
      label: 'Date Format',
      fieldtype: 'Select',
      options: [
        'dd/MM/yyyy',
        'MM/dd/yyyy',
        'dd-MM-yyyy',
        'MM-dd-yyyy',
        'yyyy-MM-dd',
        'd MMM, y',
        'MMM d, y'
      ],
      default: 'MMM d, y',
      required: 1
    },
    {
      fieldname: 'floatPrecision',
      label: 'Float Precision',
      fieldtype: 'Select',
      options: ['2', '3', '4', '5'],
      default: '2',
      required: 1
    },
  ]
};
