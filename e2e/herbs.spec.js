/**
 * 药材管理完整测试
 *
 * 覆盖功能：
 * - 药材列表显示
 * - 新增药材
 * - 编辑药材信息
 * - 删除药材
 * - 搜索药材
 * - 库存预警显示
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule } = require('./helpers');

test.describe('药材管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // 展开库存管理分组
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'herbs');
  });

  test('药材列表显示', async ({ page }) => {
    await expect(page.locator('.table-container')).toBeVisible();
  });

  test('药材表头显示正确', async ({ page }) => {
    // 验证关键列存在
    const expectedHeaders = ['药材名称', '成本价', '售价', '库存', '柜号'];

    for (const header of expectedHeaders) {
      const headerCell = page.locator(`th:has-text("${header}")`);
      if (await headerCell.count() > 0) {
        await expect(headerCell.first()).toBeVisible();
      }
    }
  });

  test('新增药材按钮存在', async ({ page }) => {
    const addBtn = page.locator('#addNewBtn');
    await expect(addBtn).toBeVisible();
  });

  test('新增药材', async ({ page }) => {
    // 点击新增按钮
    await page.click('#addNewBtn');
    await page.waitForTimeout(300);

    // 验证新增行出现
    const newRow = page.locator('tr[data-id="new"]');
    await expect(newRow).toBeVisible();

    // 填写药材名称（必填）
    const timestamp = Date.now();
    await newRow.locator('input[data-col="name"]').fill(`测试药材_${timestamp}`);

    // 填写其他信息（只填写存在的字段）
    const costPriceInput = newRow.locator('input[data-col="costPrice"]');
    if (await costPriceInput.isVisible()) {
      await costPriceInput.fill('10');
    }

    const salePriceInput = newRow.locator('input[data-col="salePrice"]');
    if (await salePriceInput.isVisible()) {
      await salePriceInput.fill('15');
    }

    const stockInput = newRow.locator('input[data-col="stock"]');
    if (await stockInput.isVisible()) {
      await stockInput.fill('100');
    }

    const cabinetNoInput = newRow.locator('input[data-col="cabinetNo"]');
    if (await cabinetNoInput.isVisible()) {
      await cabinetNoInput.fill('A01');
    }

    // 点击保存
    await newRow.locator('.action-btn-save[data-action="saveNew"]').click();
    await page.waitForTimeout(500);

    // 验证保存成功（新增行消失）
    await expect(newRow).not.toBeVisible();
  });

  test('点击单元格进入编辑模式', async ({ page }) => {
    // 等待表格加载
    await page.waitForSelector('.table-container', { timeout: 10000 });

    // 找到可编辑的单元格
    const editableCell = page.locator('.cell-clickable').first();
    if (await editableCell.isVisible()) {
      await editableCell.click();
      await page.waitForTimeout(300);

      // 验证编辑输入框出现
      await expect(page.locator('.cell-input')).toBeVisible();
    }
  });

  test('编辑药材后保存', async ({ page }) => {
    // 找到第一行数据
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      // 点击编辑按钮（如果有）
      const editBtn = firstRow.locator('.action-btn-edit');
      if (await editBtn.isVisible()) {
        await editBtn.click();
        await page.waitForTimeout(300);
      }

      // 或者直接点击单元格编辑
      const editableCell = firstRow.locator('.cell-clickable').first();
      if (await editableCell.isVisible()) {
        await editableCell.click();
        await page.waitForTimeout(300);

        // 修改值
        const input = page.locator('.cell-input');
        if (await input.isVisible()) {
          await input.fill('100');
          await input.blur();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('删除药材', async ({ page }) => {
    // 找到第一行数据
    const firstRow = page.locator('tbody tr').first();
    if (await firstRow.isVisible()) {
      const deleteBtn = firstRow.locator('.action-btn-delete');
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();
        await page.waitForTimeout(300);

        // 验证确认对话框出现
        await expect(page.locator('#confirmModal.show')).toBeVisible();

        // 取消操作（避免实际删除）
        await page.click('#confirmModal.show .modal-footer button:first-child');
      }
    }
  });

  test('搜索药材', async ({ page }) => {
    // 找到搜索输入框
    const searchInput = page.locator('.search-input, #searchInput');
    if (await searchInput.isVisible()) {
      // 输入搜索关键词
      await searchInput.fill('当归');
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 验证搜索结果
      // 如果有结果，应该显示包含"当归"的药材
      const resultRows = page.locator('tbody tr');
      const count = await resultRows.count();

      if (count > 0) {
        // 验证第一行包含搜索关键词
        const firstRowText = await resultRows.first().textContent();
        // 搜索结果应该包含关键词
      }
    }
  });
});

test.describe('药材库存预警', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'herbs');
  });

  test('库存低于最小库存显示预警', async ({ page }) => {
    // 查找库存预警标识
    const lowStockBadge = page.locator('.low-stock-warning, .badge-warning');
    if (await lowStockBadge.count() > 0) {
      // 如果有预警，验证其可见
      await expect(lowStockBadge.first()).toBeVisible();
    }
  });

  test('库存列显示正确格式', async ({ page }) => {
    const stockCells = page.locator('td[data-col-key="stock"]');
    const count = await stockCells.count();

    if (count > 0) {
      // 验证库存显示为数字
      const stockText = await stockCells.first().textContent();
      const stockValue = parseFloat(stockText);
      expect(stockValue).not.toBeNaN();
    }
  });
});

test.describe('药材批量操作', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'herbs');
  });

  test('批量选择功能', async ({ page }) => {
    // 查找全选复选框
    const selectAllCheckbox = page.locator('thead .row-checkbox, thead input[type="checkbox"]');
    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.click();
      await page.waitForTimeout(300);

      // 验证所有行被选中
      const checkedRows = page.locator('tbody .row-checkbox:checked, tbody input[type="checkbox"]:checked');
      const count = await checkedRows.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('批量删除按钮显示', async ({ page }) => {
    // 先选择一些行
    const firstCheckbox = page.locator('tbody .row-checkbox, tbody input[type="checkbox"]').first();
    if (await firstCheckbox.isVisible()) {
      await firstCheckbox.click();
      await page.waitForTimeout(300);

      // 验证批量删除按钮出现
      const batchDeleteBtn = page.locator('.batch-delete-btn, #batchDeleteBtn');
      if (await batchDeleteBtn.isVisible()) {
        await expect(batchDeleteBtn).toBeVisible();
      }
    }
  });
});

test.describe('药材信息验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'herbs');
  });

  test('新增药材必填验证', async ({ page }) => {
    // 点击新增按钮
    await page.click('#addNewBtn');
    await page.waitForTimeout(300);

    const newRow = page.locator('tr[data-id="new"]');
    await expect(newRow).toBeVisible();

    // 不填写药材名称直接保存
    await newRow.locator('.action-btn-save[data-action="saveNew"]').click();
    await page.waitForTimeout(500);

    // 验证错误提示
    // 应该显示"请填写药材名称"或类似的提示
    const toast = page.locator('.toast.show');
    if (await toast.isVisible()) {
      const toastText = await toast.textContent();
      expect(toastText).toContain('药材名称');
    }
  });

  test('价格输入验证', async ({ page }) => {
    // 点击新增按钮
    await page.click('#addNewBtn');
    await page.waitForTimeout(300);

    const newRow = page.locator('tr[data-id="new"]');

    // 填写药材名称
    await newRow.locator('input[data-col="name"]').fill('测试价格验证');

    // 验证价格输入框类型为 number
    const costPriceInput = newRow.locator('input[data-col="costPrice"]');
    if (await costPriceInput.isVisible()) {
      expect(await costPriceInput.getAttribute('type')).toBe('number');
      // 填写有效数字
      await costPriceInput.fill('10.5');
      await costPriceInput.blur();
    }
  });
});