const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  category: {
    type: DataTypes.ENUM('financial', 'vendor', 'contract', 'project', 'custom'),
    allowNull: false
  },
  dataSource: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'data_source'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by'
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_public'
  },
  isScheduled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_scheduled'
  },
  scheduleFrequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'quarterly'),
    field: 'schedule_frequency'
  },
  nextSchedule: {
    type: DataTypes.DATE,
    field: 'next_schedule'
  }
}, {
  tableName: 'reports',
  timestamps: true,
  underscored: true
});

module.exports = Report;