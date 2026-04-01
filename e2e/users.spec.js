/**
 * 用户管理模块测试
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule, waitForTable } = require('./helpers');

test.describe('用户管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await switchModule(page, 'users');
    await waitForTable(page);
  });

  test('用户列表显示', async ({ page }) => {
    await expect(page.locator('.table-container table')).toBeVisible();
  });

  test('用户搜索功能', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('测试');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('.table-container table')).toBeVisible();
  });
});