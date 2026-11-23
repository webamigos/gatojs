export type Ui = {
  intro(title: string): void;
  step(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  note(title: string, lines: string[]): void;
  outro(message: string): void;
  task<T>(label: string, work: () => Promise<T>): Promise<T>;
};
