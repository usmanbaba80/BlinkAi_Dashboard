import { DataTypes } from 'sequelize';
import { sequelize } from '../database.js';

// Define the SearchQuery model for the search_queries table
const SearchQuery = sequelize.define('SearchQuery', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'id'
  },
  keyword: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Search keyword',
    field: 'keyword'
  },
  search_type: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Type of search performed',
    field: 'search_type'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW,
    comment: 'When the query was created',
    field: 'created_at'
  }
}, {
  tableName: 'search_queries',
  timestamps: false, // Using custom created_at field instead of createdAt/updatedAt
  underscored: true
});

export default SearchQuery;
