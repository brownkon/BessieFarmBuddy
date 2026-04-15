


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'display_name');
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "title" "text" DEFAULT 'New Chat'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "prompt" "text" NOT NULL,
    "response" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "gps_coordinates" "jsonb",
    "tools_used" "jsonb",
    "session_id" "uuid"
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cow_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "animal_number" "text" NOT NULL,
    "cow_group" "text",
    "location" "text",
    "robot" "text",
    "animal_tag_id" "text",
    "animal_life_no" "text",
    "lactation_no" integer,
    "lactation_days" integer,
    "day_production" double precision,
    "day_production_deviation" double precision,
    "reproduction_status" "text",
    "last_insemination" "text",
    "days_pregnant" integer,
    "days_to_dry_off" integer,
    "expected_calving_date" "text",
    "production_status" "text",
    "gender" "text",
    "rest_feed" double precision,
    "failures" integer,
    "failed_milking" integer,
    "milkings_lactation" double precision,
    "milkings_milk" double precision,
    "fat_protein_ratio" double precision,
    "nr_of_refusal" integer,
    "color_code" "text",
    "end_milk_till" "text",
    "milk_separation" "text",
    "body_score" double precision,
    "intake_total" double precision,
    "rest_feed_total" double precision,
    "scc_indication" integer,
    "last_fertility_diagnose" "text",
    "last_fertility_remarks" "text",
    "last_fertility" "text",
    "days_since_heat" integer,
    "insemination_no" integer,
    "pregnancy_check_date" "text",
    "lf" double precision,
    "lr" double precision,
    "rr" double precision,
    "rf" double precision,
    "milk_temperature" double precision,
    "rumination_herd" integer,
    "rumination_att_count" integer,
    "inversion_ketosis" "text",
    "activity_deviation" integer,
    "rumination_minutes" integer,
    "sire" "text",
    "inseminate" "text",
    "too_late_for_milking" "text",
    "milk_visit_yield" double precision,
    "last_milk" "text",
    "train_cow" "text",
    "calving_date" "text",
    "sick_chance" integer,
    "sick_change_status" "text",
    "sensors" "jsonb",
    "severeness" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cow_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."farmer_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "organization_id" "uuid",
    "content" "text" NOT NULL,
    "animal_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."farmer_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "role" "text" DEFAULT 'employee'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['boss'::"text", 'employee'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "billing_info" "text",
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "access_code" "text" NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."organizations"."access_code" IS 'Access code that employees use to join organization';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "report_delivery_method" "text" DEFAULT 'email'::"text",
    "report_delivery_destination" "text",
    "report_schedule_enabled" boolean DEFAULT true,
    "report_schedule_time" time without time zone DEFAULT '18:00:00'::time without time zone,
    "report_timezone" "text" DEFAULT 'America/Denver'::"text",
    CONSTRAINT "profiles_report_delivery_method_check" CHECK (("report_delivery_method" = ANY (ARRAY['email'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."report_send_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "delivery_method" "text",
    "success" boolean DEFAULT true
);


ALTER TABLE "public"."report_send_log" OWNER TO "postgres";


ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cow_data"
    ADD CONSTRAINT "cow_data_organization_id_animal_number_key" UNIQUE ("organization_id", "animal_number");



ALTER TABLE ONLY "public"."cow_data"
    ADD CONSTRAINT "cow_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."farmer_notes"
    ADD CONSTRAINT "farmer_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_access_code_key" UNIQUE ("access_code");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."report_send_log"
    ADD CONSTRAINT "report_send_log_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_chats_session_id" ON "public"."chats" USING "btree" ("session_id");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cow_data"
    ADD CONSTRAINT "cow_data_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."farmer_notes"
    ADD CONSTRAINT "farmer_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."farmer_notes"
    ADD CONSTRAINT "farmer_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."report_send_log"
    ADD CONSTRAINT "report_send_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin manage" ON "public"."organization_members" USING (("role" = 'boss'::"text"));



CREATE POLICY "Leaders can manage cow data" ON "public"."cow_data" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "cow_data"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'boss'::"text")))));



CREATE POLICY "Leaders can manage organization chats" ON "public"."chats" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" IN ( SELECT "organization_members_1"."organization_id"
           FROM "public"."organization_members" "organization_members_1"
          WHERE (("organization_members_1"."user_id" = "auth"."uid"()) AND ("organization_members_1"."role" = 'boss'::"text")))) AND ("organization_members"."user_id" = "chats"."user_id")))));



CREATE POLICY "Self view" ON "public"."organization_members" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own send log" ON "public"."report_send_log" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own notes" ON "public"."farmer_notes" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "farmer_notes"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can manage own chats" ON "public"."chats" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own sessions" ON "public"."chat_sessions" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own send log" ON "public"."report_send_log" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read/update own profile" ON "public"."profiles" USING (("auth"."uid"() = "id"));



CREATE POLICY "View cow data" ON "public"."cow_data" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "cow_data"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "View farmer notes" ON "public"."farmer_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "farmer_notes"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "View organization" ON "public"."organizations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organizations"."id") AND ("organization_members"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cow_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."farmer_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."report_send_log" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


















GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."cow_data" TO "anon";
GRANT ALL ON TABLE "public"."cow_data" TO "authenticated";
GRANT ALL ON TABLE "public"."cow_data" TO "service_role";



GRANT ALL ON TABLE "public"."farmer_notes" TO "anon";
GRANT ALL ON TABLE "public"."farmer_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."farmer_notes" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."report_send_log" TO "anon";
GRANT ALL ON TABLE "public"."report_send_log" TO "authenticated";
GRANT ALL ON TABLE "public"."report_send_log" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


