import { Actor } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';
import { gotScraping } from 'got-scraping';

// Initialize the Apify SDK
await Actor.init();

// Fetch Actor Input from Apify Console or local testing
const input = (await Actor.getInput()) || {};
const {
    searchTerms = ['Home Care Agencies', 'Healthcare Clinics'],
    location = 'New York, NY',
    maxResults = 100,
    extractEmails = true,
    proxyConfiguration: rawProxyConfig,
} = input;

console.log(`🚀 Starting Opility B2B Lead Generator`);
console.log(`📍 Location: ${location}`);
console.log(`🔍 Search Categories: ${searchTerms.join(', ')}`);
console.log(`🎯 Target Max Leads: ${maxResults}`);

const proxyConfiguration = await Actor.createProxyConfiguration(rawProxyConfig);

let totalScraped = 0;
const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
const ignoredEmailExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'sentry', 'wixpress.com'];

/**
 * Utility to extract emails from raw HTML text
 */
function extractEmailsFromText(text) {
    if (!text) return [];
    const matches = text.match(emailRegex) || [];
    const cleaned = new Set();

    for (let email of matches) {
        email = email.toLowerCase().trim();
        const ext = email.split('.').pop();
        if (!ignoredEmailExtensions.includes(ext) && !email.includes('example.com') && !email.includes('domain.com')) {
            cleaned.add(email);
        }
    }
    return Array.from(cleaned);
}

/**
 * Utility to extract social media profile links
 */
function extractSocials($, htmlText) {
    const socials = {
        linkedin: null,
        facebook: null,
        twitter: null,
        instagram: null,
    };

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('linkedin.com/company') || href.includes('linkedin.com/in')) {
            socials.linkedin = href;
        } else if (href.includes('facebook.com/')) {
            socials.facebook = href;
        } else if (href.includes('twitter.com/') || href.includes('x.com/')) {
            socials.twitter = href;
        } else if (href.includes('instagram.com/')) {
            socials.instagram = href;
        }
    });

    return socials;
}

/**
 * Crawling website for deep email and contact details
 */
async function scrapeBusinessWebsite(websiteUrl) {
    if (!websiteUrl || !websiteUrl.startsWith('http')) {
        return { emails: [], socials: {} };
    }

    try {
        const response = await gotScraping({
            url: websiteUrl,
            timeout: { request: 10000 },
            proxyUrl: proxyConfiguration ? await proxyConfiguration.newUrl() : undefined,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        const html = response.body;
        const emails = extractEmailsFromText(html);
        const cheerio = (await import('cheerio')).load(html);
        const socials = extractSocials(cheerio, html);

        return { emails, socials };
    } catch (err) {
        console.log(`⚠️ Website scan skipped for ${websiteUrl}: ${err.message}`);
        return { emails: [], socials: {} };
    }
}

// Prepare search URLs for directory / search scraping
const startUrls = [];
for (const term of searchTerms) {
    const query = encodeURIComponent(`${term} in ${location}`);
    startUrls.push({
        url: `https://html.duckduckgo.com/html/?q=${query}`,
        userData: { term, label: 'SEARCH' },
    });
}

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: maxResults * 2,
    requestHandler: async ({ $, request }) => {
        if (totalScraped >= maxResults) return;

        if (request.userData.label === 'SEARCH') {
            const results = $('.result');

            for (let i = 0; i < results.length; i++) {
                if (totalScraped >= maxResults) break;

                const el = $(results[i]);
                const title = el.find('.result__title').text().trim();
                const snippet = el.find('.result__snippet').text().trim();
                const rawUrl = el.find('.result__url').attr('href') || el.find('.result__title a').attr('href') || '';
                
                let website = rawUrl;
                if (website.includes('uddg=')) {
                    const match = website.match(/uddg=([^&]+)/);
                    if (match) website = decodeURIComponent(match[1]);
                }

                // Extract embedded phone numbers if present in snippet
                const phoneMatch = snippet.match(/(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
                const phone = phoneMatch ? phoneMatch[0] : null;

                let emails = extractEmailsFromText(snippet);
                let socials = {};

                if (extractEmails && website && website.startsWith('http')) {
                    const deepScraped = await scrapeBusinessWebsite(website);
                    emails = Array.from(new Set([...emails, ...deepScraped.emails]));
                    socials = deepScraped.socials;
                }

                const leadRecord = {
                    title,
                    category: request.userData.term,
                    location,
                    snippet,
                    website: website || null,
                    phone: phone || null,
                    email: emails.length > 0 ? emails[0] : null,
                    allEmails: emails,
                    socialLinks: socials,
                    scrapedAt: new Date().toISOString(),
                    source: 'Opility B2B Engine',
                };

                await Dataset.pushData(leadRecord);
                totalScraped++;
                console.log(`✅ [${totalScraped}/${maxResults}] Extracted B2B Lead: ${title} | Email: ${leadRecord.email || 'N/A'} | Phone: ${phone || 'N/A'}`);
            }
        }
    },
});

await crawler.run(startUrls);

console.log(`🎉 Scraping finished! Total B2B leads generated: ${totalScraped}`);
await Actor.exit();
