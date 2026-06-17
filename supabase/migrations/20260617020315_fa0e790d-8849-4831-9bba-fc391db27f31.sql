DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'chat_conversations_set_updated_at'
      AND tgrelid = 'public.chat_conversations'::regclass
  ) THEN
    CREATE TRIGGER chat_conversations_set_updated_at
      BEFORE UPDATE ON public.chat_conversations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'chat_messages_after_insert'
      AND tgrelid = 'public.chat_messages'::regclass
  ) THEN
    CREATE TRIGGER chat_messages_after_insert
      AFTER INSERT ON public.chat_messages
      FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_insert();
  END IF;
END $$;