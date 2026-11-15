const Order = require('../models/Order');

/**
 * Get comprehensive sales analytics and reports
 */
const getSalesSummary = async (req, res, next) => {
  try {
    let orders = await Order.find();

    // Strictly exclude test orders from sales totals and reports
    orders = orders.filter(o => !o.isTest);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Filter today's orders
    const todayOrders = orders.filter(o => new Date(o.createdAt).getTime() >= startOfToday);

    // Filter non-rejected orders for financial calculations
    const validTodayOrders = todayOrders.filter(o => o.status !== 'rejected');
    const validAllOrders = orders.filter(o => o.status !== 'rejected');

    // Financial Metrics
    const todayRevenue = validTodayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const todayTax = validTodayOrders.reduce((sum, o) => sum + (Number(o.tax) || 0), 0);
    const todaySubtotal = validTodayOrders.reduce((sum, o) => sum + (Number(o.subtotal) || 0), 0);
    const todayOrdersCount = todayOrders.length;
    const todayCompletedCount = todayOrders.filter(o => o.status === 'served').length;
    const todayPendingCount = todayOrders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)).length;
    const todayAverageOrderValue = todayOrdersCount > 0 ? Math.round(todayRevenue / todayOrdersCount) : 0;

    // All-time Metrics
    const allTimeRevenue = validAllOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const allTimeOrdersCount = orders.length;

    // Top Selling Items (computed across all valid orders)
    const itemMap = {};
    for (const order of validAllOrders) {
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const key = item.name;
          if (!itemMap[key]) {
            itemMap[key] = {
              name: item.name,
              category: item.category || 'other',
              emoji: item.emoji || '☕',
              qtySold: 0,
              revenue: 0
            };
          }
          itemMap[key].qtySold += Number(item.qty) || 1;
          itemMap[key].revenue += (Number(item.price) || 0) * (Number(item.qty) || 1);
        }
      }
    }

    const topItems = Object.values(itemMap)
      .sort((a, b) => b.qtySold - a.qtySold)
      .slice(0, 10);

    // Sales by Category
    const categoryMap = {};
    for (const item of Object.values(itemMap)) {
      const cat = item.category || 'other';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { category: cat, revenue: 0, count: 0 };
      }
      categoryMap[cat].revenue += item.revenue;
      categoryMap[cat].count += item.qtySold;
    }
    const salesByCategory = Object.values(categoryMap);

    // Hourly Sales Distribution (Today)
    const hourlySales = Array(24).fill(0).map((_, hour) => ({
      hour: `${hour.toString().padStart(2, '0')}:00`,
      orders: 0,
      revenue: 0
    }));

    for (const order of validTodayOrders) {
      const orderDate = new Date(order.createdAt);
      const hour = orderDate.getHours();
      hourlySales[hour].orders += 1;
      hourlySales[hour].revenue += Number(order.total) || 0;
    }

    // Payment Methods Breakdown
    const paymentMethods = {
      counter: 0,
      upi: 0,
      cash: 0,
      card: 0
    };
    for (const order of validTodayOrders) {
      const method = (order.paymentMethod || 'counter').toLowerCase();
      paymentMethods[method] = (paymentMethods[method] || 0) + (Number(order.total) || 0);
    }

    res.json({
      success: true,
      data: {
        today: {
          revenue: Math.round(todayRevenue * 100) / 100,
          subtotal: Math.round(todaySubtotal * 100) / 100,
          tax: Math.round(todayTax * 100) / 100,
          ordersCount: todayOrdersCount,
          completedCount: todayCompletedCount,
          pendingCount: todayPendingCount,
          averageOrderValue: todayAverageOrderValue,
          hourlySales,
          paymentMethods
        },
        allTime: {
          revenue: Math.round(allTimeRevenue * 100) / 100,
          ordersCount: allTimeOrdersCount
        },
        topItems,
        salesByCategory
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSalesSummary
};
