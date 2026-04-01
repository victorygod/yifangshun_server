/**
 * 管理后台测试
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule, waitForTable } = require('./helpers');

test.describe('管理后台', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('首页正常加载', async ({ page }) => {
    // 验证顶部栏
    await expect(page.locator('.header-title')).toContainText('易方顺诊所助手');

    // 验证侧边栏存在
    await expect(page.locator('.sidebar')).toBeVisible();

    // 验证主内容区存在
    await expect(page.locator('.main')).toBeVisible();
  });

  test('侧边栏菜单项存在', async ({ page }) => {
    // 等待侧边栏加载
    await page.waitForSelector('.sidebar', { timeout: 10000 });

    // 验证菜单项存在
    const menuItems = ['dashboard', 'users', 'stock', 'schedule', 'data'];

    for (const item of menuItems) {
      const el = page.locator(`.menu-item[data-id="${item}"], .menu-group[data-group="${item}"]`);
      await expect(el).toBeVisible();
    }
  });

  test('切换到用户管理模块', async ({ page }) => {
    await switchModule(page, 'users');
    await expect(page.locator('.table-container')).toBeVisible();
  });
});

test.describe('登录测试', () => {
  test('登录页面正常加载', async ({ page }) => {
    await page.goto('/login.html');
    await expect(page).toHaveTitle(/易方顺诊所/);
    await expect(page.locator('h1')).toContainText('易方顺诊所');
  });
});