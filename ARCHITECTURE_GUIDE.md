# Candy Match-3 Architecture Guide

Bu dokumanin amaci, projeyi buyuturken dosya sismesini ve regresyon riskini azaltmaktir.
Ozellikle hikaye, ekonomi, event, live-ops gibi buyuk ozellikler icin bu kurallar zorunludur.

## 1) Dosya Boyutu ve Sorumluluk Kurali

- Soft limit: 450 satir.
- Hard limit: 600 satir (bu sinirdan sonra ayni dosyaya yeni feature eklenmez).
- Her dosya tek bir ana sorumluluk tasir.
- Bir dosyada UI + oyun mantigi + save mantigi ayni anda birikmez.

## 2) Katmanlar

### Core Gameplay
- Grid, match, fall, combo, hint gibi saf oyun dongusu.
- Hedef: belirli kurallar, testlenebilir saf fonksiyonlar.

### Meta Systems
- Mission, progression, story, economy, inventory.
- Hedef: oyun dongusunden bagimsiz state yonetimi.

### UI Controllers
- Menu, HUD, modals, toasts, panel gecisleri.
- Hedef: sadece gosterim ve kullanici etkilesimi.

### Persistence
- Save schema, version, migration, slot yonetimi.
- Hedef: tek bir save API merkezi.

### View / FX
- Render, animasyon, efekt, sahne aksiyonlari.
- Hedef: mantik degil, sunum.

## 3) GameManager Politikasi

GameManager birikimli is sinifi degil, orchestration katmani olacak:

- Allowed:
  - sistemleri baslatma/entegre etme
  - olaylar arasi baglanti kurma
- Not allowed:
  - buyuk UI akislari
  - detayli save slot mantigi
  - hikaye diyalog state karar agaci

Yeni feature eklerken GameManager degisikligi hedefi:
- 20-40 satir entegrasyon
- detaylar ayri modullerde

## 4) Save Sistem Kurallari

- Save payload version zorunlu (version field).
- Her yeni sistem kendi state blogunu ekler (storyState, economyState gibi).
- Geriye donuk uyum icin migration katmani gerekir.
- Continue (auto) ve manuel slotlar ayni normalize/validate yolunu kullanir.

## 5) Feature Ekleme Protokolu

Her yeni feature su sirayla gider:

1. Kisa teknik tasarim (5-15 madde).
2. Dosya plani (hangi dosya acilacak, hangisi degisecek).
3. Modul implementasyonu.
4. En son entegrasyon.
5. Regresyon checklist.

## 6) Hikaye Sistemi Icin Onerilen Moduller

- src/core/StoryManager.js
- src/core/DialogueManager.js
- src/core/StoryState.js
- src/core/StorySaveAdapter.js
- src/ui/StoryPanelController.js

Not: Hikaye metinleri i18n anahtarlariyla gider, kod icine dogrudan metin yazilmaz.

## 7) Regresyon Checklist (Minimum)

Her merge/feature sonrasi en az su kontroller yapilir:

1. New game aciliyor mu?
2. Continue dogru state yukluyor mu?
3. Save now ve slot save/load/delete calisiyor mu?
4. Menu -> oyuna donus akislari bozuldu mu?
5. Mission ve level-up akislari stabil mi?
6. Dil degisiminde menuler dogru metin gosteriyor mu?

## 8) Kod Inceleme Kriteri

PR kabul kriterleri:

- Dosya satir limiti asilmamali.
- Yeni kod modul tabanli olmali.
- Degisiklik kapsam disi dosyalari sisirmemeli.
- Entegrasyon noktasi acik olmali (hangi olay nereden geliyor belli olmali).

## 9) Kisa Karar Ozeti

- Kucuk patch: mevcut dosyada kalabilir.
- Orta feature: ayri modul + minimal entegrasyon.
- Buyuk feature (story/economy/live ops): once mimari plan, sonra moduller.

Bu dokuman ekipte tek kaynak olarak kullanilir.
