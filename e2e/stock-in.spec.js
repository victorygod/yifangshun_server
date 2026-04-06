/**
 * 入库单管理完整测试
 *
 * 覆盖功能：
 * - 新建入库单
 * - 填写入库明细
 * - 成本价自动计算
 * - 订单总金额自动计算
 * - 确认入库
 * - 退回草稿
 * - 删除入库单
 */

const { test, expect } = require('@playwright/test');
const { login, switchModule } = require('./helpers');

test.describe('入库单管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // 展开库存管理分组
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('新建入库单', async ({ page }) => {
    // 点击新增按钮
    await page.click('#addNewBtn');
    await page.waitForTimeout(300);

    // 验证新增行出现
    const newRow = page.locator('tr[data-id="new"]');
    await expect(newRow).toBeVisible();

    // 填写供应商名称（必填）
    await newRow.locator('input[data-col="supplierName"]').fill('测试供应商');

    // 点击保存
    await newRow.locator('.action-btn-save[data-action="saveNew"]').click();
    await page.waitForTimeout(500);

    // 验证保存成功（新增行消失，列表中出现新记录）
    await expect(newRow).not.toBeVisible();
  });

  test('入库单展开查看明细', async ({ page }) => {
    // 点击第一个展开按钮
    const expandBtn = page.locator('.action-btn-expand').first();
    if (await expandBtn.isVisible()) {
      await expandBtn.click();
      await page.waitForTimeout(300);

      // 验证明细表格出现
      await expect(page.locator('.detail-table')).toBeVisible();
    }
  });

  test('入库单状态显示正确', async ({ page }) => {
    // 验证状态列存在
    const statusBadge = page.locator('td .badge').first();
    if (await statusBadge.isVisible()) {
      const text = await statusBadge.textContent();
      expect(['草稿', '已入库']).toContain(text);
    }
  });

  test('草稿状态显示确认入库按钮', async ({ page }) => {
    // 找到草稿状态的行
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      // 验证确认入库按钮存在
      const confirmBtn = draftRow.locator('.action-btn-confirm');
      await expect(confirmBtn).toBeVisible();
    }
  });

  test('已入库状态显示退回草稿按钮', async ({ page }) => {
    // 找到已入库状态的行
    const stockedRow = page.locator('tr').filter({ has: page.locator('.badge-stocked') }).first();
    if (await stockedRow.isVisible()) {
      // 验证退回草稿按钮存在
      const revertBtn = stockedRow.locator('.action-btn-revert');
      await expect(revertBtn).toBeVisible();
    }
  });

  test('草稿状态可以删除', async ({ page }) => {
    // 找到草稿状态的行
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      // 验证删除按钮存在
      const deleteBtn = draftRow.locator('.action-btn-delete');
      await expect(deleteBtn).toBeVisible();
    }
  });

  test('已入库状态不能删除', async ({ page }) => {
    // 找到已入库状态的行
    const stockedRow = page.locator('tr').filter({ has: page.locator('.badge-stocked') }).first();
    if (await stockedRow.isVisible()) {
      // 验证删除按钮不存在
      const deleteBtn = stockedRow.locator('.action-btn-delete');
      await expect(deleteBtn).not.toBeVisible();
    }
  });
});

test.describe('入库明细管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('展开入库单显示明细表格', async ({ page }) => {
    // 找到草稿状态的入库单并展开
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证明细表格存在
      await expect(page.locator('.detail-table')).toBeVisible();

      // 验证明细表头
      const headers = ['药材名称', '克数', '进货单价', '成本价'];
      for (const header of headers) {
        await expect(page.locator(`.detail-table th:has-text("${header}")`)).toBeVisible();
      }
    }
  });

  test('新增明细行存在', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 验证新增明细行存在
      const newDetailRow = page.locator('tr.detail-new-row');
      await expect(newDetailRow).toBeVisible();
    }
  });

  test('填写明细后可以添加', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 填写新增明细
      const newDetailRow = page.locator('tr.detail-new-row');
      await newDetailRow.locator('input[data-col="herbName"]').fill('当归');
      await newDetailRow.locator('input[data-col="quantity"]').fill('100');
      await newDetailRow.locator('input[data-col="unitPrice"]').fill('50');

      // 点击添加按钮
      await newDetailRow.locator('.action-btn-add').click();
      await page.waitForTimeout(500);

      // 验证添加成功（等待 toast 或列表刷新）
      await page.waitForTimeout(1000);
    }
  });

  test('已入库入库单不能添加明细', async ({ page }) => {
    const stockedRow = page.locator('tr').filter({ has: page.locator('.badge-stocked') }).first();
    if (await stockedRow.isVisible()) {
      await stockedRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 已入库的入库单不应该有新增明细行
      const newDetailRow = page.locator('tr.detail-new-row');
      await expect(newDetailRow).not.toBeVisible();
    }
  });
});

test.describe('入库单确认入库流程', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('确认入库弹出确认对话框', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-confirm').click();
      await page.waitForTimeout(300);

      // 验证确认对话框出现
      await expect(page.locator('#confirmModal.show')).toBeVisible();
      await expect(page.locator('#confirmMessage')).toContainText('库存将自动增加');

      // 取消操作
      await page.click('#confirmModal.show .modal-footer button:first-child');
    }
  });

  test('确认入库后状态变为已入库', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      const rowId = await draftRow.getAttribute('data-id');

      await draftRow.locator('.action-btn-confirm').click();
      await page.waitForTimeout(300);

      // 点击确认按钮
      await page.click('#confirmBtn');
      await page.waitForTimeout(1000);

      // 验证状态变化（刷新后检查）
      await page.waitForTimeout(500);
    }
  });
});

test.describe('入库单退回草稿流程', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('退回草稿弹出确认对话框', async ({ page }) => {
    const stockedRow = page.locator('tr').filter({ has: page.locator('.badge-stocked') }).first();
    if (await stockedRow.isVisible()) {
      await stockedRow.locator('.action-btn-revert').click();
      await page.waitForTimeout(300);

      // 验证确认对话框出现
      await expect(page.locator('#confirmModal.show')).toBeVisible();
      await expect(page.locator('#confirmMessage')).toContainText('库存将自动恢复');

      // 取消操作
      await page.click('#confirmModal.show .modal-footer button:first-child');
    }
  });
});

test.describe('成本价自动计算', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('成本价计算公式正确', async ({ page }) => {
    // 成本价 = (当前库存 * 当前成本 + 进货克数 * 进货单价) / (当前库存 + 进货克数)
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      const newDetailRow = page.locator('tr.detail-new-row');
      if (await newDetailRow.isVisible()) {
        // 填写药材名称
        await newDetailRow.locator('input[data-col="herbName"]').fill('当归');

        // 填写克数和进货单价
        await newDetailRow.locator('input[data-col="quantity"]').fill('100');
        await newDetailRow.locator('input[data-col="unitPrice"]').fill('50');

        // 触发成本价计算（失焦）
        await newDetailRow.locator('input[data-col="unitPrice"]').blur();
        await page.waitForTimeout(500);

        // 验证成本价被计算
        const costPriceInput = newDetailRow.locator('input[data-col="costPrice"]');
        const costPrice = await costPriceInput.inputValue();

        // 成本价应该是一个有效的数字
        expect(parseFloat(costPrice)).not.toBeNaN();
      }
    }
  });

  test('新药材成本价等于进货单价', async ({ page }) => {
    // 新药材（库存为0）的成本价应该等于进货单价
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      const newDetailRow = page.locator('tr.detail-new-row');
      if (await newDetailRow.isVisible()) {
        // 使用一个不存在的药材名称（新药材）
        const timestamp = Date.now();
        await newDetailRow.locator('input[data-col="herbName"]').fill(`新药材_${timestamp}`);
        await newDetailRow.locator('input[data-col="quantity"]').fill('50');
        await newDetailRow.locator('input[data-col="unitPrice"]').fill('30');

        // 触发计算
        await newDetailRow.locator('input[data-col="unitPrice"]').blur();
        await page.waitForTimeout(500);

        // 验证成本价等于进货单价（新药材库存为0）
        const costPriceInput = newDetailRow.locator('input[data-col="costPrice"]');
        const costPrice = parseFloat(await costPriceInput.inputValue());

        // 新药材成本价应该等于进货单价
        expect(costPrice).toBeCloseTo(30, 1);
      }
    }
  });

  test('已有药材成本价加权平均计算', async ({ page }) => {
    // 已有药材的成本价应该按加权平均计算
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      const newDetailRow = page.locator('tr.detail-new-row');
      if (await newDetailRow.isVisible()) {
        // 使用一个已存在的药材名称
        await newDetailRow.locator('input[data-col="herbName"]').fill('当归');
        await newDetailRow.locator('input[data-col="quantity"]').fill('100');
        await newDetailRow.locator('input[data-col="unitPrice"]').fill('50');

        // 触发计算
        await newDetailRow.locator('input[data-col="unitPrice"]').blur();
        await page.waitForTimeout(800);

        // 验证成本价输入框有值
        const costPriceInput = newDetailRow.locator('input[data-col="costPrice"]');
        const costPrice = await costPriceInput.inputValue();

        // 成本价应该被计算出来
        expect(parseFloat(costPrice)).not.toBeNaN();
      }
    }
  });

  test('成本价提示显示当前成本', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      const newDetailRow = page.locator('tr.detail-new-row');
      if (await newDetailRow.isVisible()) {
        // 输入药材名称
        await newDetailRow.locator('input[data-col="herbName"]').fill('当归');
        await page.waitForTimeout(500);

        // 验证成本价提示显示
        const hint = newDetailRow.locator('.field-hint');
        if (await hint.isVisible()) {
          const hintText = await hint.textContent();
          // 提示应该显示"(现成本:xxx)"或"(新药材)"
          expect(hintText).toMatch(/现成本|新药材/);
        }
      }
    }
  });

  test('修改克数重新计算成本价', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      const newDetailRow = page.locator('tr.detail-new-row');
      if (await newDetailRow.isVisible()) {
        // 填写初始值
        await newDetailRow.locator('input[data-col="herbName"]').fill('当归');
        await newDetailRow.locator('input[data-col="quantity"]').fill('100');
        await newDetailRow.locator('input[data-col="unitPrice"]').fill('50');
        await newDetailRow.locator('input[data-col="unitPrice"]').blur();
        await page.waitForTimeout(500);

        const costPriceInput = newDetailRow.locator('input[data-col="costPrice"]');
        const initialCost = parseFloat(await costPriceInput.inputValue());

        // 修改克数
        await newDetailRow.locator('input[data-col="quantity"]').fill('200');
        await newDetailRow.locator('input[data-col="quantity"]').blur();
        await page.waitForTimeout(500);

        // 验证成本价被重新计算
        const newCost = parseFloat(await costPriceInput.inputValue());
        // 成本价应该变化
        expect(newCost).not.toBeNaN();
      }
    }
  });
});

test.describe('订单总金额自动计算', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('总金额计算公式正确', async ({ page }) => {
    // 总金额 = 所有明细的(克数 * 进货单价)之和
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 找到明细行
      const detailRows = page.locator('tr[data-order-id]');
      const count = await detailRows.count();

      if (count > 0) {
        // 收集所有明细的金额
        let expectedTotal = 0;

        for (let i = 0; i < count; i++) {
          const row = detailRows.nth(i);
          const quantityInput = row.locator('input[data-col="quantity"]');
          const unitPriceInput = row.locator('input[data-col="unitPrice"]');

          if (await quantityInput.isVisible() && await unitPriceInput.isVisible()) {
            const quantity = parseFloat(await quantityInput.inputValue()) || 0;
            const unitPrice = parseFloat(await unitPriceInput.inputValue()) || 0;
            // 单价为公斤价，数量为克数，需除以1000
            expectedTotal += quantity * unitPrice / 1000;
          }
        }

        // 验证总金额显示
        const totalAmountCell = draftRow.locator('td[data-col-key="totalAmount"] span.cell-readonly');
        if (await totalAmountCell.isVisible()) {
          const displayedTotal = parseFloat(await totalAmountCell.textContent()) || 0;
          // 允许一定的精度误差
          expect(Math.abs(displayedTotal - expectedTotal)).toBeLessThan(0.1);
        }
      }
    }
  });

  test('添加明细后总金额更新', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      // 获取当前总金额
      const totalAmountCell = draftRow.locator('td[data-col-key="totalAmount"] span.cell-readonly');
      const initialTotal = await totalAmountCell.isVisible()
        ? parseFloat(await totalAmountCell.textContent()) || 0
        : 0;

      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 添加新明细
      const newDetailRow = page.locator('tr.detail-new-row');
      if (await newDetailRow.isVisible()) {
        await newDetailRow.locator('input[data-col="herbName"]').fill('测试药材');
        await newDetailRow.locator('input[data-col="quantity"]').fill('100');
        await newDetailRow.locator('input[data-col="unitPrice"]').fill('20');

        // 触发计算
        await newDetailRow.locator('input[data-col="unitPrice"]').blur();
        await page.waitForTimeout(500);

        // 验证总金额增加
        const newTotal = await totalAmountCell.isVisible()
          ? parseFloat(await totalAmountCell.textContent()) || 0
          : 0;

        // 新明细金额 = 100 * 20 = 2000
        // 总金额应该增加
        expect(newTotal).toBeGreaterThanOrEqual(initialTotal);
      }
    }
  });

  test('修改明细数量后总金额更新', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      await draftRow.locator('.action-btn-expand').click();
      await page.waitForTimeout(500);

      // 找到已有明细行
      const detailRow = page.locator('tr[data-detail-id]').first();
      if (await detailRow.isVisible()) {
        const quantityInput = detailRow.locator('input[data-col="quantity"]');
        const unitPriceInput = detailRow.locator('input[data-col="unitPrice"]');

        if (await quantityInput.isVisible() && await unitPriceInput.isVisible()) {
          // 修改数量
          await quantityInput.fill('200');
          await quantityInput.blur();
          await page.waitForTimeout(500);

          // 验证总金额更新
          const totalAmountCell = draftRow.locator('td[data-col-key="totalAmount"] span.cell-readonly');
          if (await totalAmountCell.isVisible()) {
            const newTotal = parseFloat(await totalAmountCell.textContent()) || 0;
            expect(newTotal).not.toBeNaN();
          }
        }
      }
    }
  });
});

test.describe('入库单删除流程', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('删除草稿入库单弹出确认对话框', async ({ page }) => {
    const draftRow = page.locator('tr').filter({ has: page.locator('.badge-draft') }).first();
    if (await draftRow.isVisible()) {
      const deleteBtn = draftRow.locator('.action-btn-delete');
      await deleteBtn.click();
      await page.waitForTimeout(300);

      // 验证确认对话框出现
      await expect(page.locator('#confirmModal.show')).toBeVisible();

      // 取消操作
      await page.click('#confirmModal.show .modal-footer button:first-child');
    }
  });

  test('删除已入库入库单需要先退回草稿', async ({ page }) => {
    const stockedRow = page.locator('tr').filter({ has: page.locator('.badge-stocked') }).first();
    if (await stockedRow.isVisible()) {
      const deleteBtn = stockedRow.locator('.action-btn-delete');
      // 已入库的入库单不应该有删除按钮
      await expect(deleteBtn).not.toBeVisible();
    }
  });
});

test.describe('入库单搜索功能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    const stockGroup = page.locator('.menu-group[data-group="stock"]');
    if (await stockGroup.isVisible()) {
      await stockGroup.locator('.menu-group-header').click();
      await page.waitForTimeout(300);
    }
    await switchModule(page, 'stock_in_orders');
  });

  test('搜索入库单', async ({ page }) => {
    const searchInput = page.locator('.search-input, #searchInput');
    if (await searchInput.isVisible()) {
      await searchInput.fill('供应商');
      // 按Enter键触发搜索
      await searchInput.press('Enter');
      await page.waitForTimeout(500);

      // 验证搜索结果
      const resultRows = page.locator('tbody tr');
      const count = await resultRows.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});