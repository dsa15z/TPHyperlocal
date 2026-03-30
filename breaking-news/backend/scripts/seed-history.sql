-- History of the Day seed data — notable events for broadcast use
-- Mix of national and Houston-local events

INSERT INTO "HistoryEvent" (id, month, day, year, title, description, category, significance, "isLocal", "createdAt")
VALUES
-- January
(gen_random_uuid(), 1, 1, 1863, 'Emancipation Proclamation takes effect', 'President Lincoln''s executive order freeing slaves in Confederate states officially takes effect.', 'POLITICS', 9, false, now()),
(gen_random_uuid(), 1, 12, 1966, 'Houston Astrodome hosts first event', 'The Houston Astrodome, the world''s first domed stadium, hosts its inaugural event.', 'SPORTS', 8, true, now()),
(gen_random_uuid(), 1, 28, 1986, 'Space Shuttle Challenger disaster', 'The Space Shuttle Challenger breaks apart 73 seconds after launch, killing all seven crew members. NASA Johnson Space Center in Houston manages the investigation.', 'SCIENCE', 10, true, now()),
-- February
(gen_random_uuid(), 2, 1, 2003, 'Space Shuttle Columbia disaster', 'Columbia disintegrates during re-entry over Texas, killing all seven crew. Debris found across East Texas. Houston''s Johnson Space Center leads recovery.', 'SCIENCE', 10, true, now()),
(gen_random_uuid(), 2, 14, 1929, 'St. Valentine''s Day Massacre', 'Seven members of Chicago''s North Side Gang are murdered in a warehouse, attributed to Al Capone''s gang.', 'CRIME', 8, false, now()),
-- March
(gen_random_uuid(), 3, 2, 1836, 'Texas Declaration of Independence', 'Delegates at Washington-on-the-Brazos sign the Texas Declaration of Independence from Mexico.', 'POLITICS', 9, true, now()),
(gen_random_uuid(), 3, 6, 1836, 'Fall of the Alamo', 'After a 13-day siege, Mexican forces overwhelm the Alamo defenders in San Antonio.', 'POLITICS', 10, true, now()),
-- April
(gen_random_uuid(), 4, 16, 1947, 'Texas City disaster', 'An ammonium nitrate explosion aboard a ship in Texas City kills 581 people, one of the deadliest industrial accidents in US history.', 'EMERGENCY', 10, true, now()),
(gen_random_uuid(), 4, 20, 2010, 'Deepwater Horizon explosion', 'BP''s Deepwater Horizon oil rig explodes in the Gulf of Mexico, killing 11 workers and causing the largest marine oil spill in history.', 'ENVIRONMENT', 10, true, now()),
-- May
(gen_random_uuid(), 5, 25, 1965, 'Muhammad Ali vs Sonny Liston in Houston', 'Muhammad Ali defeats Sonny Liston in a controversial first-round knockout at Houston''s NRG Center (then Convention Center).', 'SPORTS', 7, true, now()),
-- June
(gen_random_uuid(), 6, 9, 2001, 'Tropical Storm Allison devastates Houston', 'Tropical Storm Allison dumps 40 inches of rain on Houston over 5 days, causing $9 billion in damage and 23 deaths.', 'WEATHER', 10, true, now()),
-- July
(gen_random_uuid(), 7, 20, 1969, 'Apollo 11 Moon landing', '"Houston, Tranquility Base here. The Eagle has landed." Neil Armstrong and Buzz Aldrin become the first humans to walk on the Moon, directed from NASA''s Johnson Space Center.', 'SCIENCE', 10, true, now()),
-- August
(gen_random_uuid(), 8, 25, 2017, 'Hurricane Harvey makes landfall', 'Hurricane Harvey strikes the Texas coast as a Category 4 hurricane, causing catastrophic flooding in Houston. Over 100 deaths and $125 billion in damage.', 'WEATHER', 10, true, now()),
-- September
(gen_random_uuid(), 9, 11, 2001, 'September 11 attacks', 'Terrorist attacks destroy the World Trade Center towers and damage the Pentagon, killing nearly 3,000 people.', 'EMERGENCY', 10, false, now()),
(gen_random_uuid(), 9, 8, 1900, 'Great Galveston Hurricane', 'The deadliest natural disaster in US history kills an estimated 6,000-12,000 people in Galveston, Texas.', 'WEATHER', 10, true, now()),
-- October
(gen_random_uuid(), 10, 1, 2017, 'Las Vegas shooting', 'A gunman opens fire at a country music festival in Las Vegas, killing 60 people in the deadliest mass shooting in modern US history.', 'CRIME', 9, false, now()),
-- November
(gen_random_uuid(), 11, 22, 1963, 'President Kennedy assassinated', 'President John F. Kennedy is assassinated in Dallas, Texas. Lyndon B. Johnson, a Texan, is sworn in as president.', 'POLITICS', 10, true, now()),
-- December
(gen_random_uuid(), 12, 7, 1941, 'Pearl Harbor attacked', 'Japan attacks the US naval base at Pearl Harbor, Hawaii, drawing the United States into World War II.', 'POLITICS', 10, false, now()),
(gen_random_uuid(), 12, 11, 2008, 'Bernie Madoff arrested', 'Bernard Madoff is arrested for running the largest Ponzi scheme in history, defrauding investors of $65 billion. Houston-based investors among the victims.', 'FINANCE', 8, true, now());
