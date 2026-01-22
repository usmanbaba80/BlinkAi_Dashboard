-- Setup script for search_queries table
-- Run this in your PostgreSQL database if the table doesn't exist yet

-- Create the search_queries table
CREATE TABLE IF NOT EXISTS search_queries (
  id SERIAL PRIMARY KEY,
  keyword TEXT,
  search_type TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_search_queries_search_type ON search_queries(search_type);
CREATE INDEX IF NOT EXISTS idx_search_queries_created_at ON search_queries(created_at DESC);

-- Create a trigger to automatically update the timestamp
CREATE OR REPLACE FUNCTION update_created_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_search_queries_created_at ON search_queries;

CREATE TRIGGER update_search_queries_created_at
    BEFORE UPDATE ON search_queries
    FOR EACH ROW
    EXECUTE FUNCTION update_created_at_column();

-- Insert some sample data (optional)
INSERT INTO search_queries (keyword, search_type, created_at) VALUES
  ('software engineer', 'job', NOW()),
  ('data scientist', 'job', NOW()),
  ('web developer', 'job', NOW()),
  ('product manager', 'job', NOW()),
  ('UX designer', 'job', NOW());

COMMENT ON TABLE search_queries IS 'Stores search queries and metadata';
COMMENT ON COLUMN search_queries.id IS 'Primary key identifier';
COMMENT ON COLUMN search_queries.keyword IS 'The search keyword';
COMMENT ON COLUMN search_queries.search_type IS 'Type of search performed';
COMMENT ON COLUMN search_queries.created_at IS 'When the query was created';

-- Verify the table was created
SELECT 
  table_name, 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'search_queries'
ORDER BY ordinal_position;
