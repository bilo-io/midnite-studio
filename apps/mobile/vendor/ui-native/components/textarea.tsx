import { forwardRef } from 'react';
import type { TextInput } from 'react-native';

import { Field, type FieldProps } from './field';

export type TextareaProps = FieldProps;

/** A multi-line text field matching Input: at least 80dp tall, text from the top. */
export const Textarea = forwardRef<TextInput, TextareaProps>(function Textarea(
  { numberOfLines = 4, ...props },
  ref,
) {
  return <Field ref={ref} numberOfLines={numberOfLines} {...props} multiline />;
});
