-- 선수 상세 수정의 42804 감사 로그 타입 오류를 읽기 전용으로 진단합니다.
-- 이 파일은 함수, 트리거, 데이터를 변경하지 않습니다.

with column_types as (
  select
    'COLUMN_TYPE'::text as section,
    table_record.relname || '.' || column_record.attname as object_name,
    format_type(column_record.atttypid, column_record.atttypmod) as detail
  from pg_attribute column_record
  join pg_class table_record
    on table_record.oid = column_record.attrelid
  join pg_namespace table_schema
    on table_schema.oid = table_record.relnamespace
  where table_schema.nspname = 'public'
    and (
      (table_record.relname = 'admin_users' and column_record.attname = 'role')
      or (table_record.relname = 'admin_audit_logs' and column_record.attname = 'actor_role')
    )
    and not column_record.attisdropped
), table_triggers as (
  select
    'TABLE_TRIGGER'::text as section,
    target_table.relname || '.' || trigger_record.tgname as object_name,
    trigger_function.proname || ': '
      || pg_get_triggerdef(trigger_record.oid, true) as detail
  from pg_trigger trigger_record
  join pg_class target_table
    on target_table.oid = trigger_record.tgrelid
  join pg_namespace table_schema
    on table_schema.oid = target_table.relnamespace
  join pg_proc trigger_function
    on trigger_function.oid = trigger_record.tgfoid
  where table_schema.nspname = 'public'
    and target_table.relname in (
      'manual_overrides', 'team_players', 'admin_audit_logs'
    )
    and not trigger_record.tgisinternal
), audit_functions as (
  select
    'AUDIT_FUNCTION'::text as section,
    trigger_function.proname || '('
      || pg_get_function_identity_arguments(trigger_function.oid) || ')'
      as object_name,
    trigger_function.prosrc as detail
  from pg_proc trigger_function
  join pg_namespace function_schema
    on function_schema.oid = trigger_function.pronamespace
  where function_schema.nspname = 'public'
    and trigger_function.prorettype = 'trigger'::regtype
    and (
      position('admin_audit_logs' in lower(trigger_function.prosrc)) > 0
      or position('data_center_write_audit' in lower(trigger_function.prosrc)) > 0
      or position('actor_role' in lower(trigger_function.prosrc)) > 0
    )
)
select section, object_name, detail from column_types
union all
select section, object_name, detail from table_triggers
union all
select section, object_name, detail from audit_functions
order by section, object_name;
