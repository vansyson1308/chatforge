import { getQuickJS } from "quickjs-emscripten";
import { expect, it } from "vitest";

it("evaluates an expression inside QuickJS", async () => {
  const quickjs = await getQuickJS();
  const vm = quickjs.newContext();
  try {
    const result = vm.evalCode("1 + 1");
    if (result.error) {
      const error = vm.dump(result.error);
      result.error.dispose();
      throw new Error(JSON.stringify(error));
    }
    try {
      expect(vm.dump(result.value)).toBe(2);
    } finally {
      result.value.dispose();
    }
  } finally {
    vm.dispose();
  }
});
