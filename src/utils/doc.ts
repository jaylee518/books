import { Doc } from 'fyo/model/doc';
import { Field } from 'schemas/types';

export function evaluateReadOnly(field: Field, doc: Doc) {
  if (field.fieldname === 'numberSeries' && !doc.notInserted) {
    return true;
  }

  if (doc.isSubmitted || doc.parentdoc?.isSubmitted) {
    return true;
  }

  if (doc.isCancelled || doc.parentdoc?.isCancelled) {
    return true;
  }

  return evaluateFieldMeta(field, doc, 'readOnly');
}

export function evaluateHidden(field: Field, doc: Doc) {
  return evaluateFieldMeta(field, doc, 'hidden');
}

export function evaluateRequired(field: Field, doc: Doc) {
  return evaluateFieldMeta(field, doc, 'required');
}

function evaluateFieldMeta(
  field: Field,
  doc: Doc,
  meta: 'required' | 'hidden' | 'readOnly',
  defaultValue: boolean = false
) {
  const value = field[meta];
  if (value !== undefined) {
    return value;
  }

  const hiddenFunction = doc[meta][field.fieldname];
  if (hiddenFunction !== undefined) {
    return hiddenFunction();
  }

  return defaultValue;
}
