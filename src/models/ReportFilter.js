const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReportFilter = sequelize.define('ReportFilter', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  reportId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'report_id'
  },
  fieldName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'field_name'
  },
  filterLabel: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'filter_label'
  },
  filterType: {
    type: DataTypes.ENUM('date', 'select', 'multiselect', 'number', 'text'),
    allowNull: false,
    field: 'filter_type'
  },
  filterValue: {
    type: DataTypes.TEXT,
    field: 'filter_value'
  },
  filterOptions: {
    type: DataTypes.JSON,
    field: 'filter_options'
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'sort_order'
  }
}, {
  tableName: 'report_filters',
  timestamps: false,
  underscored: true
});

module.exports = ReportFilter;