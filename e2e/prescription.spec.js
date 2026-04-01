/**
 * 处方管理模块测试
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule, waitForTable } = require('./helpers');

test.describe('处方记录模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // 展开数据管理分组
    const dataGroup = page.locator('.menu-group[data-group="data"]');
    if (await dataGroup.isVisible()) {
      await dataGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'prescriptions');
    await waitForTable(page);
  });

  test('处方列表显示', async ({ page }) => {
    await expect(page.locator('.table-container table')).toBeVisible();
  });

  test('处方搜索功能', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await searchInput.fill('测试');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);

    await expect(page.locator('.table-container table')).toBeVisible();
  });
});