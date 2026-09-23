export interface TextTransformer {
  readonly name: string;
  transform(text: string): Promise<string> | string;
}
