-- This trigger is internal, not an RPC. Revoking direct execution leaves the
-- existing ledger_entries trigger and its SECURITY DEFINER checks intact.
revoke execute on function public.protect_allocated_ledger_expense()
  from public, anon, authenticated;