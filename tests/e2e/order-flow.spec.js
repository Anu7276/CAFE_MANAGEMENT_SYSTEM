// @ts-check
const { test, expect } = require('@playwright/test');
const { generateTableSig } = require('../../server/utils/tableToken');

test.describe('End-to-End Café Emerald Order Flow', () => {
  test('Customer Scan -> Order -> Kitchen Accept -> Live Status Updates -> Served', async ({ browser }) => {
    // Context 1: Customer at Table 2
    const customerContext = await browser.newContext();
    const customerPage = await customerContext.newPage();

    const tableNum = 2;
    const sig = generateTableSig(tableNum);
    const tableUrl = `/t/${tableNum}?sig=${sig}`;

    // 1. Customer scans table QR link
    await customerPage.goto(tableUrl);
    await expect(customerPage).toHaveTitle(/Café Emerald|Menu/i);
    await expect(customerPage.locator(`text=Table ${tableNum}`)).toBeVisible();

    // 2. Select an item and add to cart
    const addToCartBtn = customerPage.locator('button:has-text("Add to Cart")').first();
    await addToCartBtn.waitFor({ state: 'visible' });
    await addToCartBtn.click();

    // 3. Open cart and review pricing
    const openCartBtn = customerPage.locator('button:has-text("Review & Checkout"), button:has-text("Open Cart"), button:has-text("View Cart")').first();
    await openCartBtn.click();

    // Verify GST & Subtotal calculation lines exist
    await expect(customerPage.locator('text=Subtotal')).toBeVisible();
    await expect(customerPage.locator('text=GST (5% split 2.5% CGST + 2.5% SGST)')).toBeVisible();

    // 4. Place order
    const placeOrderBtn = customerPage.locator('button:has-text("Place Order")');
    await placeOrderBtn.click();

    // 5. Live tracker renders with order number & received state
    await expect(customerPage.locator('text=Live Order Status')).toBeVisible({ timeout: 10000 });
    await expect(customerPage.locator('text=Received')).toBeVisible();

    // Context 2: Kitchen Operator / Admin at /admin
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await staffPage.goto('/admin');

    // Sign in to staff portal
    const emailInput = staffPage.locator('input[type="email"]');
    if (await emailInput.isVisible()) {
      await emailInput.fill('admin@cafeemerald.com');
      await staffPage.locator('input[type="password"]').fill('adminpassword123');
      await staffPage.locator('button[type="submit"]').click();
    }

    // Locate the incoming order in Kitchen KDS
    await expect(staffPage.locator(`text=Table ${tableNum}`)).toBeVisible({ timeout: 10000 });

    // Step 6: Staff moves order to "Start Preparing"
    const prepareBtn = staffPage.locator('button:has-text("Start Preparing")').first();
    await prepareBtn.click();

    // Verify Customer page updates live via WebSocket
    await expect(customerPage.locator('text=Preparing')).toBeVisible({ timeout: 8000 });

    // Step 7: Staff marks order "Mark Ready"
    const readyBtn = staffPage.locator('button:has-text("Mark Ready")').first();
    await readyBtn.click();

    await expect(customerPage.locator('text=Ready')).toBeVisible({ timeout: 8000 });

    // Step 8: Staff marks order "Mark Served"
    const servedBtn = staffPage.locator('button:has-text("Mark Served")').first();
    await servedBtn.click();

    await expect(customerPage.locator('text=Served')).toBeVisible({ timeout: 8000 });

    // Clean up
    await customerContext.close();
    await staffContext.close();
  });
});
