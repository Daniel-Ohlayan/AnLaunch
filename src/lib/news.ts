// Получение последних новостей Minecraft с официального API

export interface MinecraftNews {
  id: string;
  title: string;
  category: string;
  date: string;
  text: string;
  image?: string;
  url: string;
}

interface RawNews {
  id: string;
  title: string;
  category: string;
  date: string;
  text: string;
  image?: { url?: string };
  readMoreLink?: string;
}

const CACHE_KEY = "anlaunch_mc_news";
const CACHE_TTL = 30 * 60 * 1000; // 30 минут

export async function fetchMinecraftNews(): Promise<MinecraftNews[]> {
  // Проверяем кеш
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      if (Date.now() - data.timestamp < CACHE_TTL) {
        return data.news;
      }
    }
  } catch {
    // ignore
  }

  try {
    const res = await fetch(
      "https://launchercontent.mojang.com/ru-ru/news.json",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error("Не удалось получить новости");
    const data = await res.json();

    const news: MinecraftNews[] = (data.entries || []).slice(0, 10).map((n: RawNews) => ({
      id: n.id,
      title: n.title,
      category: n.category,
      date: n.date,
      text: n.text,
      image: n.image?.url,
      url: n.readMoreLink || "https://minecraft.net",
    }));

    // Сохраняем в кеш
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ news, timestamp: Date.now() })
    );

    return news;
  } catch (e) {
    // Если не получилось — возвращаем сохранённый кеш если есть
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached).news;
    } catch {
      // ignore
    }
    throw e;
  }
}
