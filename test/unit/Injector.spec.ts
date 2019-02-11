import { expect } from 'chai';
import { Injector } from '../../src/api/Injector';
import { tokens } from '../../src/tokens';
import { rootInjector } from '../../src/InjectorImpl';
import { TARGET_TOKEN, INJECTOR_TOKEN } from '../../src/api/InjectionToken';
import { Exception } from '../../src/Exception';
import { Scope } from '../../src/api/Scope';
import * as sinon from 'sinon';
import { Disposable } from '../../src/api/Disposable';

describe('InjectorImpl', () => {

  describe('AbstractInjector', () => {

    it('should be able to inject injector and target in a class', () => {
      // Arrange
      class Injectable {
        constructor(
          public readonly target: Function | undefined,
          public readonly injector: Injector<{}>) {
        }
        public static inject = tokens(TARGET_TOKEN, INJECTOR_TOKEN);
      }

      // Act
      const actual = rootInjector.injectClass(Injectable);

      // Assert
      expect(actual.target).undefined;
      expect(actual.injector).eq(rootInjector);
    });

    it('should be able to inject injector and target in a function', () => {
      // Arrange
      let actualTarget: Function | undefined;
      let actualInjector: Injector<{}> | undefined;
      const expectedResult = { result: 42 };
      function injectable(t: Function | undefined, i: Injector<{}>) {
        actualTarget = t;
        actualInjector = i;
        return expectedResult;
      }
      injectable.inject = tokens(TARGET_TOKEN, INJECTOR_TOKEN);

      // Act
      const actualResult: { result: number } = rootInjector.injectFunction(injectable);

      // Assert
      expect(actualTarget).undefined;
      expect(actualInjector).eq(rootInjector);
      expect(actualResult).eq(expectedResult);
    });

    it('should be able to provide a target into a function', () => {
      // Arrange
      function fooFactory(target: undefined | Function) {
        return `foo -> ${target && target.name}`;
      }
      fooFactory.inject = tokens(TARGET_TOKEN);
      function barFactory(target: undefined | Function, fooName: string) {
        return `${fooName} -> bar -> ${target && target.name}`;
      }
      barFactory.inject = tokens(TARGET_TOKEN, 'fooName');
      class Foo {
        constructor(public name: string) { }
        public static inject = tokens('name');
      }

      // Act
      const actualFoo = rootInjector
        .provideFactory('fooName', fooFactory)
        .provideFactory('name', barFactory)
        .injectClass(Foo);

      // Assert
      expect(actualFoo.name).eq('foo -> barFactory -> bar -> Foo');
    });

    it('should be able to provide a target into a class', () => {
      // Arrange
      class Foo {
        constructor(public target: undefined | Function) { }
        public static inject = tokens(TARGET_TOKEN);
      }
      class Bar {
        constructor(public target: undefined | Function, public foo: Foo) { }
        public static inject = tokens(TARGET_TOKEN, 'foo');
      }

      class Baz {
        constructor(public bar: Bar, public target: Function | undefined) { }
        public static inject = tokens('bar', TARGET_TOKEN);
      }

      // Act
      const actualBaz = rootInjector
        .provideClass('foo', Foo)
        .provideClass('bar', Bar)
        .injectClass(Baz);

      // Assert
      expect(actualBaz.target).undefined;
      expect(actualBaz.bar.target).eq(Baz);
      expect(actualBaz.bar.foo.target).eq(Bar);
    });

    it('should throw when no provider was found for a class', () => {
      class FooInjectable {
        constructor(public foo: string) {
        }
        public static inject = tokens('foo');
      }
      expect(() => rootInjector.injectClass(FooInjectable as any)).throws(Exception,
        'Could not inject "FooInjectable". Inner error: No provider found for "foo"!');
    });

    it('should throw when no provider was found for a function', () => {
      function foo(bar: string) {
        return bar;
      }
      foo.inject = ['bar'];
      expect(() => rootInjector.injectFunction(foo as any)).throws(Exception,
        'Could not inject "foo". Inner error: No provider found for "bar"!');
    });

    it('should be able to provide an Injector for a partial context', () => {
      class Foo {
        constructor(public injector: Injector<{ bar: number }>) { }
        public static inject = tokens(INJECTOR_TOKEN);
      }
      const barBazInjector = rootInjector
        .provideValue('bar', 42)
        .provideValue('baz', 'qux');
      const actualFoo = barBazInjector.injectClass(Foo);
      expect(actualFoo.injector).eq(barBazInjector);
    });

  });

  describe('ChildInjector', () => {

    it('should cache the value if scope = Singleton', () => {
      // Arrange
      let n = 0;
      function count() {
        return n++;
      }
      count.inject = tokens();
      const countInjector = rootInjector.provideFactory('count', count);
      class Injectable {
        constructor(public count: number) { }
        public static inject = tokens('count');
      }

      // Act
      const first = countInjector.injectClass(Injectable);
      const second = countInjector.injectClass(Injectable);

      // Assert
      expect(first.count).eq(second.count);
    });

    it('should _not_ cache the value if scope = Transient', () => {
      // Arrange
      let n = 0;
      function count() {
        return n++;
      }
      count.inject = tokens();
      const countInjector = rootInjector.provideFactory('count', count, Scope.Transient);
      class Injectable {
        constructor(public count: number) { }
        public static inject = tokens('count');
      }

      // Act
      const first = countInjector.injectClass(Injectable);
      const second = countInjector.injectClass(Injectable);

      // Assert
      expect(first.count).eq(0);
      expect(second.count).eq(1);
    });
  });

  describe('ValueProvider', () => {
    it('should be able to provide a value', () => {
      const sut = rootInjector.provideValue('foo', 42);
      const actual = sut.injectClass(class {
        constructor(public foo: number) { }
        public static inject = tokens('foo');
      });
      expect(actual.foo).eq(42);
    });
    it('should be able to provide a value from the parent injector', () => {
      const sut = rootInjector
        .provideValue('foo', 42)
        .provideValue('bar', 'baz');
      expect(sut.resolve('bar')).eq('baz');
      expect(sut.resolve('foo')).eq(42);
    });
    it('should throw after disposed', () => {
      const sut = rootInjector
        .provideValue('foo', 42);
      sut.dispose();
      expect(() => sut.resolve('foo')).throws('Injector is already disposed. Please don\'t use it anymore. Tried to resolve "foo".');
      expect(() => sut.injectClass(class Bar { })).throws('Injector is already disposed. Please don\'t use it anymore. Tried to inject "Bar".');
      expect(() => sut.injectFunction(function baz() { })).throws('Injector is already disposed. Please don\'t use it anymore. Tried to inject "baz".');
    });
  });

  describe('FactoryProvider', () => {
    it('should be able to provide the return value of the factoryMethod', () => {
      const expectedValue = { foo: 'bar' };
      function foobar() {
        return expectedValue;
      }

      const actual = rootInjector
        .provideFactory('foobar', foobar)
        .injectClass(class {
          constructor(public foobar: { foo: string }) { }
          public static inject = tokens('foobar');
        });
      expect(actual.foobar).eq(expectedValue);
    });

    it('should be able to provide parent injector values', () => {
      function answer() {
        return 42;
      }
      const factoryProvider = rootInjector.provideFactory('answer', answer);
      const actual = factoryProvider.injectClass(class {
        constructor(public injector: Injector<{ answer: number }>, public answer: number) { }
        public static inject = tokens(INJECTOR_TOKEN, 'answer');
      });
      expect(actual.injector).eq(factoryProvider);
      expect(actual.answer).eq(42);
    });

    it('should throw after disposed', () => {
      const sut = rootInjector.provideFactory('answer', function answer() {
        return 42;
      });
      sut.dispose();
      expect(() => sut.resolve('answer')).throws('Injector is already disposed. Please don\'t use it anymore. Tried to resolve "answer".');
      expect(() => sut.injectClass(class Bar { })).throws('Injector is already disposed. Please don\'t use it anymore. Tried to inject "Bar".');
      expect(() => sut.injectFunction(function baz() { })).throws('Injector is already disposed. Please don\'t use it anymore. Tried to inject "baz".');
    });
  });

  describe('ClassProvider', () => {
    it('should throw after disposed', () => {
      const sut = rootInjector.provideClass('foo', class Foo { });
      sut.dispose();
      expect(() => sut.resolve('foo')).throws('Injector is already disposed. Please don\'t use it anymore. Tried to resolve "foo".');
      expect(() => sut.injectClass(class Bar { })).throws('Injector is already disposed. Please don\'t use it anymore. Tried to inject "Bar".');
      expect(() => sut.injectFunction(function baz() { })).throws('Injector is already disposed. Please don\'t use it anymore. Tried to inject "baz".');
    });
  });

  describe('dispose', () => {

    it('should dispose all disposable singleton dependencies', () => {
      // Arrange
      class Foo {
        public dispose2 = sinon.stub();
        public dispose = sinon.stub();
      }
      function barFactory(): Disposable & { dispose3(): void; } {
        return { dispose: sinon.stub(), dispose3: sinon.stub() };
      }
      class Baz {
        constructor(public readonly bar: Disposable & { dispose3(): void; }, public readonly foo: Foo) { }
        public static inject = tokens('bar', 'foo');
      }
      const bazInjector = rootInjector
        .provideClass('foo', Foo)
        .provideFactory('bar', barFactory);
      const baz = bazInjector
        .injectClass(Baz);

      // Act
      bazInjector.dispose();

      // Assert
      expect(baz.bar.dispose).called;
      expect(baz.foo.dispose).called;
      expect(baz.foo.dispose2).not.called;
      expect(baz.bar.dispose3).not.called;
    });

    it('should also dispose transient dependencies', () => {
      class Foo { public dispose = sinon.stub(); }
      function barFactory(): Disposable { return { dispose: sinon.stub() }; }
      class Baz {
        constructor(public readonly bar: Disposable, public readonly foo: Foo) { }
        public static inject = tokens('bar', 'foo');
      }
      const bazInjector = rootInjector
        .provideClass('foo', Foo, Scope.Transient)
        .provideFactory('bar', barFactory, Scope.Transient);
      const baz = bazInjector
        .injectClass(Baz);

      // Act
      bazInjector.dispose();

      // Assert
      expect(baz.bar.dispose).called;
      expect(baz.foo.dispose).called;
    });

    it('should dispose dependencies in correct order', () => {
      class Foo { public dispose = sinon.stub(); }
      class Bar { public dispose = sinon.stub(); }
      class Baz {
        constructor(public readonly bar: Bar, public readonly foo: Foo) { }
        public static inject = tokens('bar', 'foo');
        public dispose = sinon.stub();
      }
      const bazProvider = rootInjector
        .provideClass('foo', Foo, Scope.Transient)
        .provideClass('bar', Bar)
        .provideClass('baz', Baz);
      const baz = bazProvider.resolve('baz');
      const newFoo = bazProvider.resolve('foo');

      // Act
      bazProvider.dispose();

      // Assert
      expect(baz.foo.dispose).calledBefore(baz.bar.dispose);
      expect(newFoo.dispose).calledBefore(baz.bar.dispose);
      expect(baz.bar.dispose).calledBefore(baz.dispose);
    });

    it('should not dispose injected classes or functions', () => {
      class Foo { public dispose = sinon.stub(); }
      function barFactory(): Disposable { return { dispose: sinon.stub() }; }
      const foo = rootInjector.injectClass(Foo);
      const bar = rootInjector.injectFunction(barFactory);
      rootInjector.dispose();
      expect(foo.dispose).not.called;
      expect(bar.dispose).not.called;
    });

    it('should not dispose providedValues', () => {
      const disposable: Disposable = { dispose: sinon.stub() };
      const disposableProvider = rootInjector.provideValue('disposable', disposable);
      disposableProvider.resolve('disposable');
      disposableProvider.dispose();
      expect(disposable.dispose).not.called;
    });

    it('should not break on non-disposable dependencies', () => {
      class Foo { public dispose = true; }
      function barFactory(): { dispose: string } { return { dispose: 'no-fn' }; }
      class Baz {
        constructor(public readonly bar: { dispose: string }, public readonly foo: Foo) { }
        public static inject = tokens('bar', 'foo');
      }
      const bazInjector = rootInjector
        .provideClass('foo', Foo)
        .provideFactory('bar', barFactory);
      const baz = bazInjector
        .injectClass(Baz);

      // Act
      bazInjector.dispose();

      // Assert
      expect(baz.bar.dispose).eq('no-fn');
      expect(baz.foo.dispose).eq(true);
    });

    it('should not dispose dependencies twice', () => {
      const fooProvider = rootInjector
        .provideClass('foo', class Foo implements Disposable { public dispose = sinon.stub(); });
      const foo = fooProvider.resolve('foo');
      fooProvider.dispose();
      fooProvider.dispose();
      expect(foo.dispose).calledOnce;
    });
  });

  describe('dependency tree', () => {
    it('should be able to inject a dependency tree', () => {
      // Arrange
      class Logger {
        public info(_msg: string) {
        }
      }
      class GrandChild {
        public baz = 'qux';
        constructor(public log: Logger) {
        }
        public static inject = tokens('logger');
      }
      class Child1 {
        public bar = 'foo';
        constructor(public log: Logger, public grandchild: GrandChild) {
        }
        public static inject = tokens('logger', 'grandChild');
      }
      class Child2 {
        public foo = 'bar';
        constructor(public log: Logger) {
        }
        public static inject = tokens('logger');
      }
      class Parent {
        constructor(
          public readonly child: Child1,
          public readonly child2: Child2,
          public readonly log: Logger) {
        }
        public static inject = tokens('child1', 'child2', 'logger');
      }
      const expectedLogger = new Logger();

      // Act
      const actual = rootInjector
        .provideValue('logger', expectedLogger)
        .provideClass('grandChild', GrandChild)
        .provideClass('child1', Child1)
        .provideClass('child2', Child2)
        .injectClass(Parent);

      // Assert
      expect(actual.child.bar).eq('foo');
      expect(actual.child2.foo).eq('bar');
      expect(actual.child.log).eq(expectedLogger);
      expect(actual.child2.log).eq(expectedLogger);
      expect(actual.child.grandchild.log).eq(expectedLogger);
      expect(actual.child.grandchild.baz).eq('qux');
      expect(actual.log).eq(expectedLogger);
    });
  });
});
