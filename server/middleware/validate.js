const { z } = require('zod');

const validateBody = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: issues
      });
    }
    next(err);
  }
};

// Zod Schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['owner', 'staff', 'customer']).default('staff')
});

const orderItemInputSchema = z.object({
  itemId: z.string().min(1, 'Item ID is required'),
  name: z.string().optional(),
  size: z.string().optional().default(''),
  qty: z.number().int().min(1, 'Quantity must be at least 1').max(20, 'Maximum 20 per item')
});

const createOrderSchema = z.object({
  table: z.number().int().positive('Table must be a positive integer'),
  tableSig: z.string().optional(),
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least 1 item'),
  note: z.string().max(300, 'Note cannot exceed 300 characters').optional().default(''),
  paymentMethod: z.enum(['counter', 'upi', 'card']).default('counter')
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['new', 'preparing', 'ready', 'served', 'rejected'])
});

const createItemSchema = z.object({
  name: z.string().min(2, 'Item name must be at least 2 characters'),
  category: z.string().min(1, 'Category is required'),
  price: z.number().positive('Price must be greater than zero'),
  description: z.string().optional().default(''),
  image: z.string().url('Image must be a valid URL'),
  emoji: z.string().optional().default('☕'),
  isVeg: z.boolean().default(true),
  sizes: z.array(z.object({
    name: z.string(),
    extra: z.number().min(0).default(0)
  })).optional().default([])
});

module.exports = {
  validateBody,
  loginSchema,
  registerSchema,
  createOrderSchema,
  updateOrderStatusSchema,
  createItemSchema
};
