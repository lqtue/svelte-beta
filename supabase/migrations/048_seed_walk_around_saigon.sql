-- ============================================================
-- Migration 048 — Seed sample story: "Walk around Saigon"
--
-- Seeds a public, author-less guided story covering six historic
-- District 1 landmarks. Each stop attaches a different historical
-- Saigon map (to show the overlay swap as the walker progresses)
-- and a mix of challenge types: reach, question, and free-form.
--
-- Idempotent: skips if a story with this fixed UUID already exists.
-- The fixed UUID is intentional so the sample can be linked from
-- /trip/<id> in docs and screenshots.
-- ============================================================

do $$
declare
  v_story_id constant uuid := '11111111-2222-3333-4444-555555555555';

  -- Saigon historical maps already present in production (mig-independent —
  -- guarded with `where exists` below in case any are missing locally).
  v_map_cadastre        constant uuid := '0e02b9d9-9d40-4cca-8e41-8c8373d54d3b'; -- Plan Cadastral
  v_map_surroundings    constant uuid := '3d065384-bb09-4b8c-b46b-bf006d0c3ba3'; -- Saigon & Surroundings
  v_map_routiere        constant uuid := 'ffb0f3f0-12f9-4c19-a3bf-aba291c77c9d'; -- Carte routière
  v_map_environs        constant uuid := 'f08aa539-e46e-48f4-8689-dee80bd66ec9'; -- Plan des environs
  v_map_environs2       constant uuid := 'e0193e00-8fd0-412c-92d1-46bbd1ef3d0d'; -- Environs de Saïgon
begin
  if exists (select 1 from public.stories where id = v_story_id) then
    return;
  end if;

  insert into public.stories (id, user_id, title, description, mode, region, is_public)
  values (
    v_story_id,
    null,
    'Walk around Saigon',
    'A short walking loop through the old French Quarter of Sài Gòn. Each stop layers a different historical map onto the modern city so you can see how the streets, buildings, and waterfront changed across the late-1800s and early-1900s.',
    'guided',
    jsonb_build_object('center', jsonb_build_array(106.6995, 10.7785), 'zoom', 16),
    true
  );

  -- Helper: only attach an overlay map if it actually exists in this DB.
  insert into public.story_points
    (story_id, sort_order, title, description, hint, quest,
     lon, lat, trigger_radius, interaction, challenge, overlay_map_id)
  values
    -- 1. Notre-Dame Cathedral — reach
    (v_story_id, 0,
     'Notre-Dame Cathedral Basilica',
     'Start at the twin red-brick towers of Nhà thờ Đức Bà. Completed in 1880 with bricks shipped from Marseille, the cathedral was the colonial administration''s most visible mark on the new city grid.',
     'Stand on the square in front of the main facade, between the cathedral and the post office.',
     'Walk to the cathedral square.',
     106.69914, 10.77975, 25, 'proximity',
     jsonb_build_object('type', 'reach', 'triggerRadius', 25),
     (select id from public.maps where id = v_map_cadastre)),

    -- 2. Saigon Central Post Office — question
    (v_story_id, 1,
     'Saigon Central Post Office',
     'Cross the square to the Bưu điện Trung tâm. Designed in the 1880s by the colonial Public Works department, the great barrel-vaulted hall is still a working post office.',
     'Look up at the dated medallions on the facade above the entrance.',
     'Find the year of completion engraved on the facade.',
     106.69987, 10.77983, 20, 'proximity',
     jsonb_build_object(
       'type', 'question',
       'question', 'What year is shown on the medallion above the main entrance of the Post Office?',
       'answer', '1891'
     ),
     (select id from public.maps where id = v_map_cadastre)),

    -- 3. Reunification Palace — reach
    (v_story_id, 2,
     'Reunification Palace',
     'Walk south-west down Đường Lê Duẩn to the gates of Dinh Độc Lập. The current modernist building (1966) replaced the colonial Norodom Palace destroyed in 1962; the tank that crashed the gate on 30 April 1975 still sits on the lawn.',
     'The main pedestrian gate faces Lê Duẩn. Stand opposite it across the street.',
     'Reach the front gate of the Palace.',
     106.69534, 10.77703, 30, 'proximity',
     jsonb_build_object('type', 'reach', 'triggerRadius', 30),
     (select id from public.maps where id = v_map_surroundings)),

    -- 4. Municipal Theatre (Opera House) — question
    (v_story_id, 3,
     'Saigon Opera House',
     'Head east along Lê Lợi to the Nhà hát Lớn. Opened in 1900 to host touring French companies, it briefly served as the National Assembly of South Vietnam between 1955 and 1975.',
     'Count the large statues flanking the upper facade.',
     'How many caryatid figures hold up the entrance balcony?',
     106.70298, 10.77657, 20, 'proximity',
     jsonb_build_object(
       'type', 'question',
       'question', 'How many caryatid statues hold up the balcony above the main entrance?',
       'answer', '2'
     ),
     (select id from public.maps where id = v_map_routiere)),

    -- 5. Bến Thành Market — reach
    (v_story_id, 4,
     'Bến Thành Market',
     'Continue south-west to the four-gate clock tower of Chợ Bến Thành. The current market opened in 1914 on a drained marsh; the older Bến Thành market sat closer to the river on the site of today''s State Bank.',
     'Aim for the south gate with the clock — the one facing Quách Thị Trang square.',
     'Reach the clock tower of Bến Thành.',
     106.69814, 10.77262, 25, 'proximity',
     jsonb_build_object('type', 'reach', 'triggerRadius', 25),
     (select id from public.maps where id = v_map_environs)),

    -- 6. Bạch Đằng Wharf — free-form (no challenge)
    (v_story_id, 5,
     'Bạch Đằng Wharf',
     'Finish at the Sài Gòn River. The Bến Bạch Đằng promenade follows the old colonial Quai de Belgique, where rice barges from the Mekong unloaded for export. Compare the 19th-century shoreline on the overlay with today''s embankment.',
     'Walk to the riverside promenade between the Majestic Hotel and the floating restaurants.',
     'Take in the river and the view across to Thủ Thiêm.',
     106.70582, 10.77296, 30, 'proximity',
     jsonb_build_object('type', 'none'),
     (select id from public.maps where id = v_map_environs2));
end $$;
