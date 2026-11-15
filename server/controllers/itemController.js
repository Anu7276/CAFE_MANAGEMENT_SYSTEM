const Item = require('../models/Item');
const Category = require('../models/Category');
const AuditLog = require('../models/AuditLog');
const { uploadItemImage, deleteItemImage } = require('../services/cloudinaryService');

const getItems = async (req, res, next) => {
  try {
    const { category, search, vegOnly, includeDeleted } = req.query;
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

    if (includeDeleted === 'true' && req.user) {
      query.includeDeleted = true;
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

const getItemById = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

const createItem = async (req, res, next) => {
  try {
    let imageUrl = req.body.image;
    let imagePublicId = null;

    if (req.file) {
      const uploadRes = await uploadItemImage(req.file);
      imageUrl = uploadRes.url;
      imagePublicId = uploadRes.publicId;
    }

    let parsedSizes = [];
    if (req.body.sizes) {
      parsedSizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
    }

    const itemData = {
      name: req.body.name,
      category: req.body.category,
      price: Number(req.body.price),
      description: req.body.description || '',
      image: imageUrl || 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800',
      imagePublicId,
      emoji: req.body.emoji || '☕',
      isVeg: req.body.isVeg === true || req.body.isVeg === 'true',
      isAvailable: req.body.isAvailable !== false && req.body.isAvailable !== 'false',
      sizes: parsedSizes
    };

    const item = await Item.create(itemData);

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'item_created',
      entity: 'Item',
      entityId: item._id,
      details: { name: item.name, price: item.price },
      ip: req.ip
    });

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const existing = await Item.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (req.body.price !== undefined) updates.price = Number(req.body.price);
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.emoji !== undefined) updates.emoji = req.body.emoji;
    if (req.body.isVeg !== undefined) updates.isVeg = req.body.isVeg === true || req.body.isVeg === 'true';
    if (req.body.isAvailable !== undefined) updates.isAvailable = req.body.isAvailable === true || req.body.isAvailable === 'true';

    if (req.file) {
      // Delete old asset from Cloudinary or local disk
      if (existing.image) {
        await deleteItemImage(existing.image, existing.imagePublicId);
      }
      const uploadRes = await uploadItemImage(req.file);
      updates.image = uploadRes.url;
      updates.imagePublicId = uploadRes.publicId;
    } else if (req.body.image && req.body.image !== existing.image) {
      if (existing.image) {
        await deleteItemImage(existing.image, existing.imagePublicId);
      }
      updates.image = req.body.image;
      updates.imagePublicId = null;
    }

    if (req.body.sizes) {
      updates.sizes = typeof req.body.sizes === 'string' ? JSON.parse(req.body.sizes) : req.body.sizes;
    }

    const updatedItem = await Item.findByIdAndUpdate(req.params.id, updates);

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'item_updated',
      entity: 'Item',
      entityId: req.params.id,
      details: updates,
      ip: req.ip
    });

    res.json({ success: true, data: updatedItem });
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

    const newAvail = req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : !item.isAvailable;
    const updated = await Item.findByIdAndUpdate(req.params.id, { isAvailable: newAvail });

    // Broadcast item availability change live to all clients
    const io = req.app.get('io');
    if (io) {
      io.emit('item:availability', {
        itemId: updated._id,
        name: updated.name,
        isAvailable: updated.isAvailable
      });
    }

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'item_availability_toggled',
      entity: 'Item',
      entityId: item._id,
      details: { isAvailable: newAvail },
      ip: req.ip
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const deleted = await Item.softDelete(req.params.id);

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'item_soft_deleted',
      entity: 'Item',
      entityId: item._id,
      details: { name: item.name },
      ip: req.ip
    });

    res.json({ success: true, message: 'Item soft-deleted successfully', data: deleted });
  } catch (error) {
    next(error);
  }
};

const restoreItem = async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    const restored = await Item.restore(req.params.id);

    await AuditLog.logAction({
      userId: req.user?._id,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      action: 'item_restored',
      entity: 'Item',
      entityId: item._id,
      details: { name: item.name },
      ip: req.ip
    });

    res.json({ success: true, message: 'Item restored successfully', data: restored });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getItems,
  getItemById,
  createItem,
  updateItem,
  toggleAvailability,
  deleteItem,
  restoreItem
};
