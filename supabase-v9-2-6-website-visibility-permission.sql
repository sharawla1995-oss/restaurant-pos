-- V9.2.6
-- No schema change is required: employee_permissions.permission_key is TEXT.
-- This file is optional. It documents the new permission key used by the POS:
--   websiteVisibility
--
-- Admin accounts always have this permission.
-- For other users, assign it from Users & Permissions in the POS.
notify pgrst, 'reload schema';
