import { useState, type FormEvent } from 'react';
import { issuesToFieldErrors, serverError, type FieldErrors } from './formErrors';

/** The shape of a shared zod schema's safeParse, without depending on zod directly. */
interface Schema<Out> {
  safeParse(
    input: unknown,
  ):
    | { success: true; data: Out }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}

type FieldOf<Values> = keyof Values & string;

interface Options<Values> {
  /** Prefix for input ids, e.g. "signup" gives "signup-email". */
  formId: string;
  schema: Schema<unknown>;
  initialValues: Values;
  /** Server error codes that belong to one field, e.g. `{ EMAIL_TAKEN: 'email' }`. */
  fieldByCode?: Partial<Record<string, FieldOf<Values>>>;
}

/**
 * Form state for the auth screens: validates with the shared zod schema on submit (then live, once the user
 * has tried to submit), and shows server errors on their field or at form level.
 */
export function useAuthForm<Values extends Record<string, unknown>>({
  formId,
  schema,
  initialValues,
  fieldByCode = {},
}: Options<Values>) {
  type K = FieldOf<Values>;
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors<K>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const fieldId = (field: K) => `${formId}-${field}`;

  function validate(next: Values): FieldErrors<K> {
    const result = schema.safeParse(next);
    return result.success ? {} : issuesToFieldErrors<K>(result.error.issues);
  }

  function setValue<F extends K>(field: F, value: Values[F]) {
    const next = { ...values, [field]: value };
    setValues(next);
    setFormError(null);
    if (submitted) setErrors(validate(next));
    else if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function focusField(field: K) {
    document.getElementById(fieldId(field))?.focus();
  }

  /** Wraps a submit handler: validates first, tracks pending, and maps thrown API errors. */
  function handleSubmit(onValid: (values: Values) => Promise<void>) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (pending) return;
      setSubmitted(true);
      setFormError(null);
      const fieldErrors = validate(values);
      setErrors(fieldErrors);
      const firstInvalid = (Object.keys(fieldErrors) as K[])[0];
      if (firstInvalid) {
        focusField(firstInvalid);
        return;
      }
      setPending(true);
      try {
        await onValid(values);
      } catch (err) {
        const { field, message } = serverError<K>(err, fieldByCode);
        if (field) {
          setErrors((current) => ({ ...current, [field]: message }));
          focusField(field);
        } else {
          setFormError(message);
        }
      } finally {
        setPending(false);
      }
    };
  }

  return { values, errors, formError, pending, setValue, setFormError, fieldId, handleSubmit };
}
