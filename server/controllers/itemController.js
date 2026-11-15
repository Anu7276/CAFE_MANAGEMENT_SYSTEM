const Item = require('../models/Item');
const Category = require('../models/Category');

const getItems = async (req, res, next) => {
  try {
    const { category, search, vegOnly } = req.query;
    const query = {};

    if (category && category !== 'all') {
      query.category = category;
    }

    if (vegOnly === 'true') {
      query.isVeg = true;
    }

    if (search) {
      query.search = search;
    }

    const items = await Item.find(query);
    const categories = await Category.find();

    res.json({
      success: true,
      count: items.length,
      categories,
      data: items
    });
  } catch (error) {
    next(error);
  }
};

const createItem = async (req, res, next) => {
  try {
    const item = await Item.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

const toggleAvailability = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const newAvail = req.body.isAvailable !== undefined ? req.body.isAvailable : !item.isAvailable;
    const updated = await Item.findByIdAndUpdate(req.params.id, { isAvailable: newAvail });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = { getItems, createItem, toggleAvailability };

