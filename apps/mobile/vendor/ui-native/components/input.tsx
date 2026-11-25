import { forwardRef } from 'react';
import type { TextInput } from 'react-native';

import { Field, type FieldProps } from './field';

export type InputProps = FieldProps;

/** A single-line text field on the design tokens. Give it a `label` or an `accessibilityLabel`. */
export const Input = forwardRef<TextInput, InputProps>(function Input(props, ref) {
  return <Field ref={ref} {...props} multiline={false} />;
});
