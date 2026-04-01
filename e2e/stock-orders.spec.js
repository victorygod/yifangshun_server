/**
 * 入库单和执药单管理测试
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule, waitForTable } = require('./helpers');

async function expandStockGroup(page) {
  const stockGroup = page.locator('.menu-group[data-group="stock"]');
  if (await stockGroup.isVisible()) {
    await stockGroup.locator('.menu-group-header').click();
    await page.waitForTimeout(300);
  }
}

test.describe('入库管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expandStockGroup(page);
    await switchModule(page, 'stock_in_orders');
  });

  test('入库单列表显示', async ({ page }) => {
    await expect(page.locator('.table-container')).toBeVisible();
  });

  test('新增入库单按钮存在', async ({ page }) => {
    const addBtn = page.locator('#addNewBtn');
    await expect(addBtn).toBeVisible();
  });
});

test.describe('执药单管理模块', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expandStockGroup(page);
    await switchModule(page, 'stock_out_orders');
    await waitForTable(page);
  });

  test('执药单列表显示', async ({ page }) => {
    await expect(page.locator('.table-container table')).toBeVisible();
  });
});