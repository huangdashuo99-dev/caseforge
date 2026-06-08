import { test, expect } from "@playwright/test";

test.describe("TestPilot", () => {
  test("renders header and example gallery on first visit", async ({ page }) => {
    await page.goto("/");
    // Clear localStorage to simulate first visit
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.locator("h1")).toContainText("TestPilot");
    // Example gallery should be visible when no results
    await expect(page.getByRole("heading", { name: "示例" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "用户登录功能" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "订单优惠券叠加" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "权限管理模块" })).toBeVisible();
  });

  test("shows error when submitting empty text", async ({ page }) => {
    await page.goto("/");
    await page.click("text=生成测试用例");
    await expect(page.locator("text=请输入需求描述")).toBeVisible();
  });

  test("shows character count", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("textarea");
    await textarea.fill("测试需求");
    await expect(page.locator("text=4 / 10000")).toBeVisible();
  });

  test("can type text and see char count update", async ({ page }) => {
    await page.goto("/");
    const textarea = page.locator("textarea");
    await textarea.fill("用户登录功能：支持用户名密码登录，错误3次锁定30分钟");
    await expect(page.locator("textarea")).toHaveValue(/用户名密码登录/);
  });

  test("renders API error state with retry button", async ({ page }) => {
    // Intercept API call to simulate error
    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "服务暂时不可用" }),
      })
    );

    await page.goto("/");
    const textarea = page.locator("textarea");
    await textarea.fill("测试需求");
    await page.click("text=生成测试用例");

    await expect(page.locator("text=生成失败")).toBeVisible();
    await expect(page.locator("text=服务暂时不可用")).toBeVisible();
    await expect(page.locator("text=重试")).toBeVisible();
  });

  test("renders successful result with table and export buttons", async ({ page }) => {
    const mockResponse = {
      title: "用户登录功能",
      summary: "验证登录流程的测试用例",
      testCases: [
        {
          id: "TC-001",
          title: "正常登录",
          precondition: "已有账号",
          steps: ["打开登录页", "输入用户名密码", "点击登录"],
          expected: "跳转到首页",
          priority: "P0",
          type: "功能",
        },
        {
          id: "TC-002",
          title: "密码错误",
          precondition: "已有账号",
          steps: ["打开登录页", "输入正确用户名和错误密码"],
          expected: "提示密码错误，剩余尝试次数减1",
          priority: "P1",
          type: "异常",
        },
      ],
      fuzzyPoints: [
        { description: "锁定30分钟后是自动解锁还是需要人工？", suggestion: "确认解锁机制" },
      ],
      metadata: { provider: "deepseek", model: "deepseek-v4", durationMs: 3500, tokens: 1200 },
    };

    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockResponse),
      })
    );

    await page.goto("/");
    const textarea = page.locator("textarea");
    await textarea.fill("测试需求");
    await page.click("text=生成测试用例");

    // Results should appear
    await expect(page.locator("text=用户登录功能")).toBeVisible();
    await expect(page.locator("text=TC-001")).toBeVisible();
    await expect(page.locator("text=正常登录")).toBeVisible();

    // Fuzzy points
    await expect(page.locator("text=规则模糊点")).toBeVisible();

    // Export buttons
    await expect(page.locator("text=复制文本")).toBeVisible();
    await expect(page.locator("text=下载 Excel")).toBeVisible();

    // Edit button
    await expect(page.locator("text=编辑").first()).toBeVisible();
  });

  test("opens inline edit panel when clicking edit", async ({ page }) => {
    const mockResponse = {
      title: "测试",
      summary: "",
      testCases: [
        {
          id: "TC-001",
          title: "测试用例",
          precondition: "",
          steps: ["步骤1"],
          expected: "正常",
          priority: "P0",
          type: "功能",
        },
      ],
      fuzzyPoints: [],
      metadata: { provider: "deepseek", model: "v4", durationMs: 1000, tokens: 500 },
    };

    await page.route("**/api/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockResponse),
      })
    );

    await page.goto("/");
    await page.locator("textarea").fill("测试");
    await page.click("text=生成测试用例");

    // Click edit button
    await page.locator("text=编辑").first().click();
    await expect(page.locator("text=编辑 TC-001")).toBeVisible();

    // Click again to collapse
    await page.locator("text=收起").click();
    await expect(page.locator("text=编辑 TC-001")).not.toBeVisible();
  });
});
