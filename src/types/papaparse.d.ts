declare module 'papaparse' {
  export interface ParseError {
    row?: number;
    message: string;
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
  }

  export interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean | 'greedy';
  }

  export interface UnparseConfig {
    columns?: string[];
  }

  const Papa: {
    parse<T>(csv: string, config?: ParseConfig): ParseResult<T>;
    unparse<T>(data: T[], config?: UnparseConfig): string;
  };

  export default Papa;
}
