// Mock type for repositories. Each method is a jest mock stored as a property, not a method, so
// `expect(repository.method)` does not trigger the unbound-method lint rule.

/** Maps every method of `T` to a jest mock with the same parameters and return type. */
export type MockedRepository<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends (...args: infer Args) => infer Result
    ? jest.Mock<Result, Args>
    : never;
};
