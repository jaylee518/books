module.exports = {
    commonFields: [
        {
            fieldname: 'name', fieldtype: 'Data', required: 1
        }
    ],
    parentFields: [
        {
            fieldname: 'owner', fieldtype: 'Data', required: 1
        },
        {
            fieldname: 'modifiedBy', fieldtype: 'Data', required: 1
        },
        {
            fieldname: 'creation', fieldtype: 'Datetime', required: 1
        },
        {
            fieldname: 'modified', fieldtype: 'Datetime', required: 1
        },
        {
            fieldname: 'keywords', fieldtype: 'Text'
        }
    ],
    childFields: [
        {
            fieldname: 'idx', fieldtype: 'Int', required: 1
        },
        {
            fieldname: 'parent', fieldtype: 'Data', required: 1
        },
        {
            fieldname: 'parenttype', fieldtype: 'Data', required: 1
        },
        {
            fieldname: 'parentfield', fieldtype: 'Data', required: 1
        }
    ],
    treeFields: [
        {
            fieldname: 'lft', fieldtype: 'Int', required: 1
        },
        {
            fieldname: 'rgt', fieldtype: 'Int', required: 1
        }
    ]
};
