import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, assert, expect, it, vi } from "vitest";
import { FeedPagination } from "./feed-pagination";

const observers: Observer[] = [];
class Observer {
  observe = vi.fn<() => void>();
  disconnect = vi.fn<() => void>();
  constructor(readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  intersect(isIntersecting = true) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", Observer);
});
afterEach(() => vi.unstubAllGlobals());

it("requests one next page when the end enters view, then waits for the current load to finish", () => {
  const load = vi.fn<() => void>();
  const view = render(<FeedPagination enabled onLoadMore={load} />);
  const observer = observers[0];
  assert.isDefined(observer);
  act(() => observer.intersect(false));
  expect(load).not.toHaveBeenCalled();
  act(() => {
    observer.intersect();
    observer.intersect();
  });
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<FeedPagination enabled={false} onLoadMore={load} />);
  act(() => observer.intersect());
  expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<FeedPagination enabled onLoadMore={load} />);
  const next = observers[1];
  assert.isDefined(next);
  act(() => next.intersect());
  expect(load).toHaveBeenCalledTimes(2);
});

it("does not observe while disabled and ignores queued notifications after removal", () => {
  const load = vi.fn<() => void>();
  const view = render(<FeedPagination enabled={false} onLoadMore={load} />);
  expect(observers).toHaveLength(0);
  view.rerender(<FeedPagination enabled onLoadMore={load} />);
  const observer = observers[0];
  assert.isDefined(observer);
  view.unmount();
  act(() => observer.intersect());
  expect(load).not.toHaveBeenCalled();
  expect(observer.disconnect).toHaveBeenCalled();
});
