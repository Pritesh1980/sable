// Big London Tattoo Show 2026 — the published exhibitor line-up (ExCeL, 4–6
// September 2026), as the show lists it at
// https://www.biglondontattooshow.com/tattoo-artists/artist-list
//
// Held as text, not as objects: it is the same format the import box takes, so
// it goes through `parseLineup` like any hand-paste rather than getting a
// second, parallel code path — and it stays readable and diffable when the show
// updates its line-up. One artist per line:
//
//     Name @handle — Studio, Booth N
//
// The show prints every name in capitals; these are title-cased for display.
// Two rows carry no Instagram handle because the show's own list has none.
//
// One deliberate edit to the source: the show lists "ANDRO PRIMO" (No Regrets,
// booth 315) with no handle, so `@androprimo_` was added by hand — same name,
// and the studio matches the saved artist. Remove it if that identification is
// ever shown to be wrong.
//
// Snapshot taken 22 August 2026, and the show was still adding artists, so
// treat it as a floor rather than the final list. A later import merges into
// it rather than replacing it.
export const BIG_LONDON_2026 = `
666 Trinidad @666trinidad — Bonjour Tattoo Parlour, Booth 454
A Darker Shade @adarkershade_ — Six Bullets, Booth 549
Aaron Sidney @sidneytattoo_ — The Crooked Rook Tattoo, Booth 223
Abi Shroom Tattoos @abishroom_tattoos — Skeletonman Tattoos, Booth 472
Abtattoo @a.b.tattoo — Agave Piercing & Tattoo, Booth 250
Adele @adelemundaytattoo — In Motion Tattoo Studio, Booth 171
Ademtattoo @ademtattoo — Fatfugu Collective, Booth 7
Adrianna Urban Tattoos @adrianna.urban — Vesso Art Studio, Booth 64
Adrien Mathieu @adrien_mathieu.ink — LE Cabinet, Booth 493
Affanita @affanita — Chimera Studios, Booth 172
Aggie Vnek @aggie_vnek — Abrakadavra Studio, Booth 302
Aisiei @aisiei_tattoo — Quore Tattoo Studio, Booth 463
Aivar_tattoo @aivar_tattoo — Noire Ink, Booth 253
AJ Curzon-Berners @aj_tattooist — White Heart Tattoo Collective, Booth 106
AJ Mendoza @tattoo_aj666 — No Regrets Studios, Booth 380
Alan Aldred @alanaldred — Black Hope Tattoo, Booth 145
Alan YU @yclung — The Mantra Tattoo, Booth 222
Aleksandras Kuznecovas @akuznecovas_tattoo — Ink Generation Tattoo, Booth 377
Alessandro Pennella @alessandro_pennella — Alessandro Pennella From Milan Italy, Booth 231
Alex Artlex @alex_artlex — Artlex Ink, Booth 279
Alex Bawn Tattoo @alexbawnuk — Alex Bawn Tattoo, Booth 227
Alex Cookie @alexcookietattoo — Inkq Tattoo, Booth 487
Alex Dragos @iad_tattoo — Dragos Tattoo Studio, Booth 402
Alexa Tattooer @alexa_tattooer — Resonance Body Art, Booth 541
Alexander Sketch @alexsketchtattoo — Etther Museum, Booth 5
Alice Hope Tattoo @alicehopetattoo — Electric Punch Tattoo, Booth 114
Alya @alyatattooing_itsme — London’s Glitch, Booth 356
Alys Chendlik Tattoos @alyschendliktattoos — The Lucky Crane Tattoo CO, Booth 466
Amanda Hart @lurkdiggler — Control Tattoo, Booth 90
Amber_artoholic @amber_artoholic — Vesso Art Studio, Booth 115
Amir @tattoo__amir — The Devils Scribe Tattoo, Booth 334
Ammar Farah @ammartattoo — Sons of Ink, Booth 159
Amy Orchard @amyorchard_tattoos — Artium Ink, Booth 299
Ana Mady Sun @anamadysun — Ana Mady Sun, Booth 62
Andresedge @andresedge — LA Gamba Tattoo, Booth 425
Andro Primo @androprimo_ — No Regrets Studios, Booth 315
Andy Seb @andy_seb — Chartarum Gallery, Booth 539
Anna Jordan Tattoo @annajordan_tattoo — Fake Perfection, Booth 201
Annie Piper @asj.tattoos — Eye of the Storm Tattoo, Booth 357
Anshin Anshin Tattoo @anshin_anshin_tattoo — Secret Level Tattoo Studio, Booth 422
Arianna.Tattoos @arianna.tattoos — The Wise Dog Tattoo Parlour, Booth 551
Ashley Thorne @ashley_thorne_tattoo — Artium Ink, Booth 331
Ate Wamz @atewamz — Igorot Charm Cafe, Booth 214
Baby Rox Tattoo @babyroxtattoo — Tiger Lily Tattoo Leicester, Booth 375
Bam @bam.tats — Unit Two Tattoo Studio, Booth 230
Barry Braithwaite Tattoo @barrybraithwaitetattoo — Candyskull, Booth 121
Bem @bemtattoos — Club X, Booth 41
Ben Nuthink @bennuthink — Valhalla Tattoo, Booth 409
Berk Bosveren @berkbosveren — London’s Glitch, Booth 362
Bert Thomas @bert_thomas_tattoo — SKYN Yard Tattoo, Booth T41
Binay @binay.tattoo — Ink's Inc. Tattoo, Booth 74
Bingo @__full__house — Home, Booth 28
Bintt @bintt — Black Tapestry Tattoo, Booth 160
Bismerone @bismerone — Red Snake Tattoo Studio, Booth 205
Black Flesh Tattoo @blackfleshtattoo — Black Flesh Tattoo, Booth 436
Blanktattooart @blanktattooart — Creative Element Tattoo, Booth T2
Blayn @_blayn_ — Sacred Empire, Booth 430
Bobby Chow @bbc.tattoo — The Mantra Tattoo, Booth 538
Bonbonbizarre @bonbonbizarre — Crypt Ink, Booth 290
Brad.Uniqueink @brad.uniqueink — Unique Ink, Booth 75
Brandon Cooper @brandon__cooper — Green Frog Ink, Booth 226
Brigi Fuzes @brigi_fuzes_tattoo — Diamond Heart Tattoo, Booth 438
Caetano Tattoo — No Rush Studio Tattoo, Booth 5
Caitlyn Campbell @_spacezombie — Golden Yeti Art Collective, Booth 135
Callum Blaine @moosetattooart — No Regrets, Booth 61
Cappi @cappi_tattoo — Electric Thaiger Tattoo, Booth 66
Carl245tattoo @carl245tattoo — Seed of Life Tattoo, Booth 287
Carlosgalantattoo @carlosgalantattoo — Cupido Tattoo Studio, Booth 491
Carly Menasco @cahhhly — 9th Realm Gallery, Booth 123
Carter Hewlett @carterhewlett — Black Dahlia Hackney, Booth 297
Casey Marie @caseymarietattoo — Seven Stones Tattoo, Booth T21 - T22
Castillo Salinas @max_ghostar — Ghostar Ink Gallery, Booth 272
Cat Vas Tattoo @cat_vas_tattoo — SG Southgate Tattoo & Piercing, Booth 294
Caterina Ghiani @caterina_ghiani — Caterina Ghiani Atelier, Booth 521
Cerys @cerystattoo — The Lucky Crane Tattoo CO, Booth 68
Charlee Darwin @charleedarwintattoo — The Descent of Man Tattoo, Booth 178
Charlie Bissell @inkbybissell — Bissell Ink, Booth 556
Charlie Davis @tattoochar — The Soul Garden Tattoo, Booth 194
Charlotte Ann Harris @sola.kaida — Pastel Palace, Booth T43
Charp @charptattoo — 3 Birds Tattoo - Zürich, Booth 71
Chelsea Skye @chelsea.skye.tattoo — The Craft, Booth T34
Chitizz @chitiz_tattoo — Tattoo Pasal, Booth 283
Chloe Jade @bedlam.ink — Picture House Tattoo Studio, Booth 284
Chris Hatch @chrishatchtattoo — New Hope Tattoo, Booth 78
Chris Meighan @chrismeighantattoo — Santa Cruz, Booth 447
Clara Grech @zap.ink — London’s Glitch, Booth 368
Clarke @clarketattooart — One22 Tattoo Club, Booth 353
Claudio Oldswords @claudio_oldswords — Stay True Tattooing, Booth 444
Connor Cade @connorcade — Timeless Tattoo, Booth 162
Connor Humpage @cj_humps_tattoos — Making Marks Tattoo CO, Booth 124
Courtney Coker @courtneycokertattoos — Chameleons Tattoo Parlour, Booth 257
Crawlspace @crawlspace_tattoo — Never Say Die, Booth 304
Creepy Crawler Tattoo @creepycrawlertattoo — Briar Rose Tattoo, Booth 38
Ctptattoo @ctptattoo — True Tattoo, Booth 446
Cyrino @cyrinoirezumi — Wildcat Electric Temple, Booth 354
Daisuke Sakaguchi @the27life — Minasama, Booth 108
Dan Gold @the_dan_gold — 1770 Tattoo, Booth 258
Danny Vasquez @dvasqueztattoo — Dvasquez Tattoo, Booth 84
Danny Wildhorses @dannywildhorses — Wild Horses Tattoo CO, Booth 300
Darren Hasan-Ali @angryface.tattoo — The Devils Scribe Tattoo, Booth 235
Daryl Watson @darylwatsontattoo — Tower of Hearts, Booth 398
David Barclay @tattoomonger — Gilt Moth Tattoo, Booth 481
David Corden @davidcorden — Semper, Booth T24
DB @mrdbtattoo — Deadmans Tattoo, Booth 234
Dean Thompson @dexnleettattoo — True North Tattoo Liverpool, Booth 404 - 406
Diego Santos @diegosantosink — Inkin Studioz, Booth 503
Dilettattoo @dilettattoo — Atelier Zombie, Booth 537
Dorcas Lin @dor.llhpoke — Sorry Mum London, Booth 129
Dottheglob @dottheglob — Black Dahlia Hackney, Booth 478
DRT Sanchez @drt_sanchez — Ansolute Body Art, Booth 99
Dyrs-Hjarta @dyrs_hjarta_art — Old World Remains, Booth 44
E.J Tattoo’s @e.jtattoos — Inkq Tattoo, Booth 22 -23
Earth To Frankie @_earthtofrankie_ — Label Tattoo, Booth T5 - T6
Elizabeth Snook @elizabethsnooktattoo — Heartfelt Tattoo, Booth 127
Ella’s Tattoos @ellas_tattoos — Sons of Ink, Booth 419
Ellen XO @ellenxotattoo — Sons of Ink, Booth 324
Ellie Danby @elliedanby_tattoos — Blackhopetattoo, Booth T11
Ellotattoo @ellotattoo — Tiger Lily Tattoo Leicester, Booth 510
Ellwood Tattoos @ellwood_tattoos — Ellwood Tattoo Studio, Booth 394
Elmo Teale @elmoteale — Iron Frog Tattoo & Good Fortune Studio, Booth 242
Emily Isabella @em.isabella_ink — Noka Tattoo, Booth 498
Emma B @emmab_tattoos — Cosmic Tattoo, Booth 552
Er.Ink.A @er.ink.a — Er.Ink.A, Booth 350
Erica @ericastatts — No Regrets, Booth 401
Erik Praseres @eriktattooartist — Erik Tattoo Studio, Booth 423
Eriktats395 @eriktats395 — Worcester Park Tattoo, Booth 435
Ernane.Revera @ernane.revera — Forget Me Knot Tattoo, Booth T35
Eve Graham Tattoo @evegrahamtattoo — Lust For Life, Booth 482
Evi Berry Falcon @evi_berry_falcon — Unit Two Tattoo Studio, Booth 544
Evita Loveheart @e.loveheartattoo — Haunted Tattoo, Booth 554
Fabrizio @fab_tattoo — One BY One, Booth 211
Federico Olivo @federico_olivo — Federico Olivo Tattoo, Booth 477
Filukitti @filukitti — James Tattoo Gallery, Booth 325
Fiona Tatts @fiona.tatts — Sons of Ink, Booth T29 - T30
Fiorella @iblamefifi.tattoo — Agave Piercing & Tattoo, Booth 107
Fla Ink @fla_ink — SG Southgate Tattoo & Piercing, Booth 468
Flora Istvanffy @floraistvanffy — Heritage Tattoo Gallery, Booth 241
Fodraws @fodraws — Strghtlnes Studio, Booth 313
Fors @fors642 — Label Tattoo, Booth 461
Freya Sutton @freyaxinks — Tattooland UK, Booth 448
Gabe Londis @drawingdeadart — 9th Realm Gallery, Booth 342
Gabriela Fraga @gfraga.tattoo — One BY One, Booth 505
Gardner Ink @gardner_ink — Gardner Ink, Booth 509
Gemma Piper @th3piedpiper — The Nook, Booth 216
George Hakin @ghakintattoo — Circus Ink, Booth 125
Gin Tattoo @gininktattoo — Gin & Ink Tattoo, Booth 516
Ginge @ginge_tattoos — Ten Tonne, Booth 323
Ginger Jeong @ginger_jeong — Hand In Hand Tattoo Studio, Booth 16
Giovanjrtattoos @giovanjrtattoos — Giovanni Lorusso, Booth 14
Good Luck Toni @goodlucktoni — Wild Horses Tattoo Co., Booth 517
Gore Tattoos @goretattoos — The Flying Fox Tattoo, Booth 378
Grace Tattoo @gracetattoo — Ivory Skull Tattoo, Booth 470
Greg Cameron @throttled_ink — Collective Tattoo, Booth 449
Griff.Tattoo @griff.tattoo — Grey Area Tattoo Studio, Booth 138
Grit UR Teeth @grit_ur_teeth — The Worst Generation, Booth 111
Grolzart @grolzart — London’s Glitch, Booth 179
Gypsy Blades Piercing @gypsybladespiercing — Gypsy Blades Piercing, Booth 476
Abi Hack @abihacktattoo — Electric Snake Tattoo CO, Booth 126
Haddock Tattoo @kaptajnhaddocktattoo — Tatovøren, Booth 193
Hajin @hajin_irezumi — Moulin Roude, Booth 261
Handling Tattoo @handling.tattoo — Fable Hollow Tattoo, Booth 484
Hannya Jayne @hannyajaynetattoo — Tengu Tattoo, Booth 514
Hei @tattooist_hei — Daya Tattoo Studio, Booth 148
Helle Ink @helle.ink — Briar Rose Tattoo, Booth 163
Holly Roberts Tattoo @holly_roberts_tattoo — Midnight Ivy Tattoo Studio, Booth 346
Horiuma @horiuma_kr — Lineup, Booth 359
Horiurushi @horiurushi_tw — Ysink, Booth 112
Hurricane Dana @hurricanedanatattoos — Semper/smb Tattoo, Booth 408
Huw Davies @huwdaviestattoo — Baba Yaga Emporium, Booth 15
Icaro @i_ca_ro — The Burning Eye Tattoo, Booth 420
Ilia Medvedev @medvedev_tattoo — Ilia Medvedev, Booth 282
Ilke @ilkegtattooart — Punk Tattoo, Booth 150
Ilovemorganxo @ilovemorganxo — Harbour Lights Social Club, Booth 79
Inagamie @inagamie — The Nook, Booth 116
Inhaler @inhaler.tattoomarine — Ellipsis Tattoo Club, Booth 100
Irinatattooer @irinatattooer — Dark Horse Collective, Booth 502
Isabella Sala @isabella__sala — Inkxs Atelier, Booth T12
Itsnuria.Ink @itsnuria.ink — London’s Glitch, Booth 202
Ivan Art Inside Tattoo @ivanartinside — Art Inside Tattoo, Booth 98
Jack Akehurst @jackakehurst — 1709 Tattoo, Booth 496
Jade Clark @clarktattoos — Kindred Soul Tattoo, Booth 29
Jake Wilkes @wilkes.inks — Vivid Ink Lichfield, Booth 130
Jakub Hendrix @jakubhendrix — Mixture Tattoo, Booth 543
James Bull @jamesbulltattoo — Tengu Tattoo, Booth 212
James Butler @jamesbutlertattoos — Easy Tiger Tattoo, Booth 303
James Taylor @jamestman — Atelier Four, Booth 450
Jamie Lee Knott @jamieleetattoo — Chapters Tattoo, Booth 413 - 416
Jamie River @bloodstonetattoos — Tramp Art Studios, Booth 355
Jammes @jammestattoo — Jammes Tattoo Studio, Booth 508
Jani Piippu @janipiipputattoo — Backstage Tattoo, Booth 54
Jared Hunter @jaredhuntertattoos — Jared Hunter Tattoos, Booth 427
Jasmine @_jasmine__070 — Drippy Bear Tattoo Studio, Booth 432
Jay Raphaello @jayraphaello — Hapheart, Booth 326
Jean LE Roux @jeanleroux — Good Fortune Studio, Booth 387
Jeff Barnard @golden_yeti — Golden Yeti Art Collective, Booth 360
Jess Brown @jessbrowntattoos — 9th Realm Gallery, Booth 458
Jess Havelock Tattoo @jesshavelocktattoo — Midnight Ivy Tattoo Studio, Booth 13
Jessica Canvas @jessicacanvas_tattoo — Golden Moth Tattoo & Piercing, Booth T15 - T16
Jezz-Lee Wood @jezzink — Samsara Parlour, Booth 488
Jhon Art @jhonart_tatto — Rabiska Tattoo, Booth T9 - T10
Jiya @jiya.tattoo — Sans Patrie Studio, Booth 400
João Beagá @joaoobh — Disturbia, Booth T39
Joe Gregory @joegregorytattoos — Interstellar Ink Tattoo Studio, Booth 381
John Dark Tattoo @johndarktattoo_ — Dark Tattoo Company, Booth 25
Johnny Chopper Ink @johnnychopper_ink — Johnnychoppertattoos, Booth 6
Jonny Ransom @jonnyransomtattoo — Held For Ransom Tattoos, Booth 184
Josh Baird @joshbairdtattoos — On Point Ink, Booth 443
Josh Dukes @mantelofrot — Immaculate Chaos, Booth 545
Josh Riley @joshrileytattoo — Adorn, Booth 53
Josh Wilson @joshianwilson — Abrakadavra Studio, Booth 336
Julian Penagos @julian_tattooart — Wimbledon Tattoo, Booth 382
Kaso Artes @kasoartes — Casa Zero, Booth T27 - T28
Katrine Macklin @katrinemacklin — Forget Me Knot Tattoo, Booth P2
Katy Sars @katysars — True Tattoo, Booth 128
Kay Bowman Tattoo @kaybowmantattoo — Freedom Tattoo, Booth 117
Kayleigh Coleman @kaycoletattoos — Luck Struck Tattoo, Booth 206
Kayley.Tattoos @kayley.tattoos — M23, Booth 190
Keith Burke @keithburke_tattoos — Sacrament Tattoo Ireland, Booth 118
Kelly Brown Tattoos @kellybrowntattoos — Lucky Crane Tattoo, Booth 85
Kerrie EM Tattoo @kerrie.emtattoo — Speckled Frog Tattoo, Booth 490
Kikyfloretattoo @kikyfloretattoo — Saisai Ink, Booth 136
Kim Yoko @kimyokotattoo — Vetala, Booth 513
Kimidoll @kimidoll.tattoo — Noland, Booth 372
King Tattoo @k1ng_tattoo — Sozo Tattoo Studio, Booth 73
Klara Dziara @klaradziara — Inksanity, Booth 248
Klaudia @klaudia.tatuaz — Silent Moon Tattoo, Booth 536
Kohstyle @kohstyle — Ushuaia London, Booth 80
Kosobuddha @kosobuddha — Briar Rose Tattoo, Booth P3
KT @forshadowedhope — 14 Arrows, Booth T36
Kubalizmus @kubalizmus — Kubalizmus, Booth 473
Kuzmin @kuzmin___tattoo — Requiem Tattoo Shropshire, Booth 455
L'Enfant Sauvage @lenfantsauvage.ink — Born To Bloom, Booth 507
Lacorte @lacortetattooer — Lacorte Tattooer, Booth 431
Lady Grimm @lady.grimm — Tiger Lily Tattoo Leicester, Booth 36
Laeh Tattoo @laeh.tattoo — Laeh Tattoo, Booth 37
Lara G @laraguzmantattoos — Wimbledon Tattoo, Booth 50
Lasimo @simonadagostino — Solid Rock Tattoo, Booth 52
Laure DE Aurys @laure_de_aurys — Laure DE Aurys, Booth 263
Lecy @_letattoo — Seed of Life Tattoo, Booth 361
Anthony Lennox Tattoo @lennoxtattoo — Artium Ink, Booth 141
Lexi Liu @lexi_tattoo — The Mantra Tattoo, Booth 465
Libby @libertyjtattoo — London’s Glitch, Booth 181
Liberty C Tattoo @libertyctattoo — Autonomy Tattoo, Booth 429
Linesbykaja @linesbykaja — Point Break Tattoo, Booth 542
Linkachuu Tattoo @linkachuu.tattoo — Sanctuarink, Booth 243
Livi Muir @livi.muir — Sans Patrie Studio, Booth 379
London Slade @londonslade — Hizenbunshinkai, Booth 289
Long Boy @long_boy_tattoo — SMB Tattoo, Booth 316
Loons @loons_tattoo — Ragequit Tattoo & Piercing, Booth 456
Lor @lorr.ink — Otherworld, Booth 86
Lord Montana Blue @montana_blue — The Good Fight, Booth 292
Louie Pecce @l0ufio — Golden Yeti Art Collective, Booth 535
Luan Roots @luanroots — Dida Tattoo, Booth 332
Lubava Popova @lyubavapop — Silent Moon Tattoo, Booth 280
Lucas Lanzoni Tattoo @lucas_lanzoni — Wildcat Electric Temple, Booth 55
Lucy Thompson Bcah @lucy_nipple — Yorkshire Mastectomy Tattoos, Booth 340
Luke Edgar @luke_edgar — Edgar Arts, Booth 504
Luke Galvin @lukegalvintattoo — The Hideaway, Booth 485
Luke Lyons @lukeylines — Chasing Ghosts, Booth 244
Maddie Roberts @maddierobertstattoo — Silver Tears Tattoo, Booth 176
Maiseytattoo @maiseytattoo — Tiger Lily Tattoo Leicester, Booth 12
Malin Carper @malincarper — Bad Mood Tattoo, Booth 245
Manson @abbeymanson — Azurite Tattoo, Booth 500
Mara @mara.tattoo — Twenty Two Tattoo, Booth 151
Marcelina Staszak @marcelina.tattoo — Hallowed.Be, Booth 161
Marcin Mikos Pixtattoo @mikos_marcin — Pixtattoo, Booth 33
Marcin Ptak @marcinptak_tattoo — Absolute Body Art, Booth 314
Marco @marco_tats — Solo Trader, Booth 349
Marco Encre @marcoencre — Encre Tattoo Studio, Booth 101
Marco_tatz @marco_tatz — Unit Two Tattoo Studio, Booth 383
Marcus Martins Tattoo @marcusmartinstattoo — No Rush Studio, Booth 207
Marie Cox @lady_fts — Folklore Tattoo Studio, Booth 42
Mark Tattoo @marktattoo_ — Sajo Tattoo Studio, Booth 345
Mary Blake @maryblake — Golden Yeti Art Collective, Booth 131
Maryssa Anne @maryssaannetattoo — Odyssey Art Collective, Booth 275
Matheus Scalon @matheusscalontattoo — No Rush Tattoo Studio, Booth 393
Matt Hewitt @matt_hewittt — Sans Patrie Studio, Booth 489
Matt Rawls @mattrawlstattoo — Swan Street Tattoo, Booth 528
Matt Webb Tattoo @mattwebbtattoo — Seventy Two Street Tattoo, Booth 200
Matthew Huggett @matt.the.ronin — Feral, Booth 72
Mattydarkside @mattydarkside — Black Dawn Tattoo, Booth 239
Maud Vegas @maudtraditionaltattooing — Maud Traditional Tattooing, Booth 164
Maury Decay @maurydecay_tattoos — Celebrity Skin Custom Tattoos, Booth 459
Maya Goldfinch @maya.goldfinch.forever.art — Dark Side Body Art, Booth 3
Meg Roberts Tattoo @megrobertstattoo — Soul of the Sun, Booth 19
Mert @mveo.ink — Go Tattoo Project, Booth 221
Mike Philp @mike_philp — Cocreate Tattoo, Booth 236
Mike Reed @mikereedtattoo — Control Tattoo, Booth 51
Milky Onion @milky.onion — Cult Collective, Booth 399
Millette @millette_tattoo — Noire Ink, Booth 388
Mina Boo @mina.boo_tattoo — Mina Boo, Booth 96
Miranda @tiagomirandaink — Disturbia Ink, Booth 185
Missfitz @_missfitztattoo — Chapters Tattoo, Booth 320
Mister Pickles Tattoo @misterpickles.tattoos — Electric Snake Tattoos, Booth 225
Mitch Micallef @mitchmicallef — Jason Davis Tattoo Studio, Booth 520
Mitchell @kiyoharu_tattooer — Mikan Tattoo, Booth 527
Mognon Martins @jean_mognon — Old Border Ink, Booth 366
Molli @memento_molli — Immaculate Chaos, Booth 217
Monny @monny636 — Immortal Art, Booth 137
Monzo @jose_andres_monzon_ — MY Life Tattoo, Booth 483
Mori @moritattoo — Ravenglaw, Booth 17
MR Shakya @aviseqska — Santo Cuervo Custom Tattoo, Booth 134
Mr.Light_kim @mr.light_kim — The_salmosa, Booth T40
Nana Letters @nana.tattoouk — SMB Tattoo, Booth 39
Gazz @gazztattoos — Gazz Tattoos, Booth 391
Neef @neef_tattoos — Mikan Tattoo, Booth 139
Niall Ciaran @niall.ttt — Exile Tattoo, Booth 329
Nick Iovene @nickfarbeyond — Far Beyond Tattoo, Booth 203
Nicole__tattoo @nicole__tattoo — SG Southgate Tattoo & Piercing, Booth 251
Niki @niki___niki___niki — Moulin Roude, Booth 395
Niorkz @niorkz — Society Studios, Booth 57
Nipper @nipper_tattoo — Fudoshin, Booth 462
Noir @noir_tattooer — The Mantra Tattoo, Booth 367
Nowaktattoo @nowaktattoo — Nowaktattoo, Booth 322
Nsmactattoos @nsmactattoos — Southgate Tattoo, Booth 87
O'Doherty @devilclawtattoo — Checkmate Stidios, Booth 526
Oakstats @oakstats — South City Market, Booth 30
Oddy Lanna Tattoo @oddylannatattoo — Oddy Lanna Tattoo, Booth 65
Oliv @oliv_tattooart — Olivia Ritler, Booth 192
Oliver J Tattoo @oliver.jtattoo — Collective Tattoo, Booth 21
Oni Kid @onikid_tattoo — Santo Cuervo Tattoo Collective, Booth 59
Oscar Tttst @oscar.tttst_ — Southgate Tattoo, Booth 310
Ovi Tattoo @ovidiu_p_tattoo — Urban Style Tattoo, Booth 341
Pacman Martinez @pacmanmartinez_tattoo — Bonjour Tattoo Parlour, Booth 295
Patryk Rowsky @patrykrowsky — Maxxam Art Collective, Booth 439
Paul J Hopkinson @pauljtattoos — Electric Punch Tattoo, Booth 494
Paul Rigby @paulrigby_tattoo — Paul Rigby Tattoo, Booth 10
Paul Vaughan @paul_vaughan_tattoos — One22tattooclub, Booth 256
Paulo Costa @paulo_costatattoo — Disturbia Ink, Booth 335
Paulo Ramos @pauloramostattoo — No Regrets Tattoo, Booth 321
Peaches Ink @peaches_ink_ — Studio EX, Booth 396
Fraser Peek @fraserpeektattoo — Fraser Peek, Booth 40
Peppe Croce @peppecroce_kappacentotattoo — Kappacento Tattoo Art Studio, Booth 467
Phil Isone Tattoo @philisonetattoo — Eye of the Storm Tattoo, Booth 386
Pinkflamingo @pinkflamingotattoo — Pinkflamingo, Booth 224
Pixel Ink 47 @pixel_ink.q7 — Spaceartattoo, Booth 506
Polish Polly Tattoo @polishpollytattoo — True Tattoo, Booth 197
Praveen Eerati @dingsingh_tattoo — Tern Tattoos, Booth 523
Prison Stye Tattoos @prisonstyle_brb — BRB Tattoo, Booth 173
Rabtattoo @rabtattoo — Easy Tiger Tattoo, Booth 518
Rabtattooing @rabtattooing — Bespoke Tattoo, Booth 492
Radu Radu @radurusu — Atelier Four, Booth 88
Rae @rarquartzoutlook.com — Cult Collective, Booth 67
Raffaele Mensi @raffaelemensi_ttt — The Arcade Tattoo Parlour, Booth 338
Rebecca Zombie @rebecca_zombie_tattoo — Vesso Art Studio, Booth 11
Redstyle @redstyletattoo — Redstyletattoo, Booth 143
Reece Bolt @reece_bolt — Harmless Tattoo, Booth 267
Reubstattoos @reubstattoos — Circus Ink, Booth 210
Rico Farbhand @ricofarbhand — Lutkznst, Booth 232
Robin Lall @robinlalltattooartist — Native Elements Art & Tattoo Studio, Booth 474
Rob Lake @roblaketattoo — Stay Much Better Tattoo, Booth T25
Rodrigo Leseduarte @rodrigo.leseduarte — Amores Perros Tattoo, Booth 475
Romo @romo.ink — Label Tattoo, Booth 555
Rosetta @paintingrst — Silent Moon Tattoo, Booth 451
Rupert Cleaver @rupertcleaver — Electric Punch Tattoo, Booth T4
Rusty Needles @rusty.needles — Stay True Tattooing, Booth 132
Ryan Sherlock @ryansherlocktattoo — Sampsons Barber & Tattoo Collective, Booth 82
Ryusi @ryusi_tattooer — Salmosa, Booth 348
S.Ferrer @s.ferrertattoo — Furtivo Tattoo, Booth 499
S.Pion @s.pion1 — 102 Tattoo Studio, Booth 288
Saffy @saffy.tattoo — Jason Davis Tattoo Studio, Booth 424
Sam Lynch @samxlynch — Stay True Tattooing, Booth 307
Samantha Jayne Tattoo @samanthajaynetattoo — Inkcubator Greenwich, Booth 18
Samhain @samhain.ttt — Les Gorgones, Booth 397
Samich Tattoos @samich_tattoos — Tattooland UK, Booth 343
Sam King Tattoo @samkingtattoo — Ily Tattoo, Booth 81
Sammy Lou @sammylou_tattoo — Gold Dagger Tattoo, Booth 277
Sandro Secchin @sandrosecchin — Southgate Tattoo, Booth 358
Saps @saps.tattoo — Southgate Tattoo, Booth 92
Sarafinatattoos @sarafinatattoos — Harmless Tattoo, Booth 233
Sarah Xuan @sarahdurnotattoos — Vivid Colors, Booth T37
Sasy @sasy_ink — Sasy Tattoo Art, Booth 213
Sebasuno @sebasuno — Etther Museum, Booth 77
Seppe_lights @seppe_lights — Ave_lights, Booth 266
Serhat Atay @serhatatay.tattooart — Punk Tattoo, Booth 247
Sharnee Oliver @sharneeoliver_tattoo — The Tattooed Hare, Booth 69
Shoreigh @shoreighhh — Pleading Insanity, Booth 497
Shrubbtatts @shrubbtatts — Old Sarum Tattoo, Booth 392
Siemor Tattooer @siemor_twoflames — Two Flames Tattoo, Booth 333
Silas Balaio @silas_balaio — No Regrets, Booth 255
Simon Cooke @tattoo_simoncooke — Tattoos at 6, Booth T1
Simon Watkins Tattoo @simonwatkinstattoo — Broken Puppet Tattoo, Booth 501
Simon.Tattoos @simon.tattoos — Unit Two Tattoo Studio, Booth 177
Simonsaysink @simonsaysink — Simonsaysinktattoos, Booth 328
Singh Tattooz @singh_tattooz — Singh Tattooz India, Booth 146
Sketch @sketchreppinink — Reppin Ink, Booth 191
Skil Mitchell @skil_mitchellgmail.com — Lucky Leopard, Booth 45
Skulltime @_skulltime_ — Blank Collective, Booth 183
Smalls @smallstattooing — True Love Tattoos, Booth 259
Snop_ink @snop_ink — Kult Tattoo Cracow, Booth 453
Sonia Swiezawska @chimera.tat — Tristram Tattoo, Booth AE
Sourmilk @davevalentinestattoos — Cvltstudios, Booth 140
Spunky Tats @spunkytats — Shu HA RI, Booth 49
Stefan Danu Tattoo @stefandanutattoo — Ink Island, Booth 464
Steph Ozzy @stephozzyink — Daya Tattoo Studio, Booth 34
Steve The Tattooist @steve.the.tattooist — Red Snake, Booth 306
Suze Tattoos @suzetattoos — Seed of Life Tattoo, Booth 534
Suzles Tattoo @suzlestattoo — The Black Arts, Booth 373
T-Paint Tattoo @tpainttattoo — T-Paint Tattoo, Booth 252
Ta2pawel @ta2pawel — Ta2pawel LTD, Booth 370
Takko San @takko.san — OH Boy Space, Booth 440
Tania J Tattoo @taniajtattoo — Noka Tattoo, Booth 445
Tappymao @tappymao — The Story of Us, Booth 479
Tattoo Zanda @tattoozanda — Tattoo Legend Tenerife, Booth 433
Tattooist_ro @tattooist_ro — Inktable, Booth T23
Tattoosbytaki @tattoosbytaki — No Studio Affiliation, Booth 434
Tatts BY Flo @tattsbyflo — Blissful Tattoos, Booth 165
Tatuaggi DI Porcellana @tatuaggidiporcellana — Blue Door, Booth 4
Tek @tek_tattooart — Clarence Street Tattoo, Booth 547
Terrakiu @terrakiu — Forget Me Knot Tattoo, Booth 389
Paul Terry @pau1terry_ — Bold Street, Booth 318
Terry Frank @terryfrank_ept — Electric Punch Tattoo, Booth 268
Thaiger Man @thaiger_tattoo — Electricthaiger Tattoo, Booth 63
The Broken Puppet @thebrokenpuppet — Broken Puppet Tattoo, Booth 273
The Fake Tattooist @the_fake_tattoooist — Unit Two Tattoo Studio, Booth 240
Theo Barnes @theo_barnes — Sans Patrie Studio, Booth 246
Theresa Gordon-Wade @eponatattoo — Epona Tattoo Sanctuary, Booth 166
Thibers @julienthibers — Clockwork Needle, Booth 47
Thomas Carli Jarlier @thomascarlijarlier — Noire Ink, Booth 97
Thomas Martinez @martineztattooer — SKYN Yard Tattoo, Booth 91
Lucy Thompson @lucy_nipple — Yorkshire Mastectomy Tattoos, Booth 94
Tiago Miranda @tiago — Disturbia Ink, Booth 457
Tianna Tatts @tianna.tatts — OH Boy Space, Booth 301
Tibor Varga Tattoo @tiborvargatattoo — North of Winter, Booth 369
Tim Hart @timharttattoo — Tim Hart Tattoo, Booth 249
Tiphaine Graves @tiphainegraves — Woody Tattoo Shop, Booth 189
Titchy Pmu @titchyppmu — True Tattoo, Booth 46
Tom Craig @_tomtattoos — Studio X, Booth 337
Tom Sorn @tom_sorn_tattoo — SMB Tattoo, Booth 262
Toni-Lou @toniloutattoo — Electric Eye Tattoo, Booth 317
Tree Harrison @treeharrisontattoo — Unit Two Tattoo Studio, Booth 122
Tyler Watson @watson_tattoo — Picture of Lily, Booth 522
Uncle Bence @uncle_bence — Sons of Ink, Booth 512
Uza @uza_tattooer — Hwarangin, Booth T14
V @v.inkverse — Inkcubator Surrey Quays, Booth 519
Vandali @v01_ink — V01ink, Booth 95
Veda Ink @veda.ink — Unit Two Tattoo Studio, Booth 363
Vee Takaloo @veeforunique — Skin Kitchen, Booth 553
Venusxtattoo @venusxtattoo — South City Market, Booth 187
Vesso Alexiev @vessoalexievart — Vesso Art Stufio, Booth 471
Vicky Smith @vickysmithtattoo — Sons of Ink, Booth 276
Victor Armero @victor_armero — Noire Ink, Booth 144
Vik Pickle @vik_pickle — Moth & Flame Tattoo, Booth 550
Vil @vil_tattoo — True Tattoo, Booth P4
Violent Violet @violentviolet.tattoo — Private Studio, Booth 442
Viví Bogdanov @vivi_b_tattoo — Sacred Hold Tattoo, Booth 185
Void Friends @void.friends — Void Earth Tattoo, Booth 418
Volkantattooz @volkantattooz — Maxxamartcollective, Booth T33
Wagi @wagink — The Devils Scribe Tattoo, Booth 149
Ward Draws @ward.draws — Electric Workshop, Booth 58
Whiley Tattoos @whileytattoos — Only Love Tattoos, Booth 208
Williams @egg_ink — Elm Street, Booth 152
Willian Tome Tattoo @williantattooartist — Willian Tome Tattoo, Booth 70
Wonton Tattoos @wontontattoos — The Nook, Booth 147
Wulfbaron @wulfbaron — Swan Street Tattoo, Booth 371
Wylie @wyliemelikoff — Lucky Leopard, Booth 142
Xam @xamthespaniard — Bonjour Tattoo Parlour, Booth 384
Xover Letters @xover.letters — Casoer Tattoo Art Shop, Booth 20
Yeonflower @yeonflower_ink — Needlespin, Booth 32
Ygtattoos @ygtattoos — Sans Patrie Studio, Booth 309
Yok @redtail_tattoo — Redtail Tattoo, Booth 347
Yoonneedle @yoonneedle — Loyostudioseoul, Booth 198
Yulita (Yulita Tattoo) @yulita.tattoo — No Regrets, Booth 344
Zac Gray @gray.reaper — Tattoo Land, Booth 237
Zamyang Yeshi @zamyang13 — Mystic Tattoo, Booth 546
Zhang @cathy_tattoo — Cathytattoo, Booth 153 - 158
Zoraya DW @inkaboutit_tattoo — Ink About It, Booth 410 - 412
`
