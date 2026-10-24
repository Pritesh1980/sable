# Recent Feature Showcase Guide

This walkthrough describes the current code, not a particular branch. Use fictional
demo data for screenshots. Live refinement testing and paid activation remain parked;
do not enable a relay or send paid requests as part of this walkthrough.

- Start the app:
  - Run `npm run dev`.
  - Open the local URL shown by Vite.
  - Home is the artwork Wall; open the drawer for **Pipeline**.

- Try AI Concepts prompt packs:
  - Go to **AI**.
  - Open **+ New concept**, then **+ Prompt packs**; type an idea or choose a Brief idea.
  - Click **Generate Prompt Pack**.
  - Switch between **ChatGPT**, **Adobe Firefly**, **Gemini**, and **Claude** prompts.
  - Save the prompt pack.
  - Reopen the saved concept card and copy one of the provider prompts.

- Try AI Concepts result variants:
  - On a saved concept card, find **AI Results**.
  - Click **Add Result**.
  - Add a title, provider, image URL or dropped image, AI text, notes, and rating.
  - Save it.
  - Add a second result variant.
  - Expand each result to inspect image, AI text, notes, provider, date, and rating.
  - Mark one result as **Best**.
  - Change its rating.
  - Delete one result and confirm the other remains.

- Try concept style matching:
  - On the same concept card, add style tags such as `dark-illustrative` or `blackwork`.
  - Check that **Top artist matches** appear.
  - Review the matching context where available.

- Try Brief idea match rationales:
  - Go to **Brief**.
  - Open or create an idea.
  - Add style tags and linked context.
  - Check the matched artists.
  - Review the match rationale explaining why each artist fits.

- Try Dashboard match rationales:
  - Go to **⋯ → Pipeline**.
  - Look at idea-to-artist matches.
  - Check the rationale text shown alongside suggested matches.

- Try artist style DNA:
  - Go to **Artists**.
  - Open artist detail pages.
  - Look for the richer style descriptions and style notes.
  - Compare artists with similar tags to see the extra descriptive layer.

- Review docs and Help:
  - Open **More -> Help**.
  - Expand **AI concepts**.
  - Confirm the Help text mentions result variants and Best results.
  - Optionally open `docs/06-concepts.md` for the longer written guide.

- Try backup/export:
  - Go to **Settings → Export Backup**.
  - Canonical image bytes are embedded; external/static links remain references.
  - Test restoring into a fresh test context, not your real library. Real login alone
    does not move a device-local library to another device.

- Try manual refinement without paid activation:
  - Open **Refine this** on an image result; text-only results cannot be refined.
  - Review the prepared source, **Change**, **Keep** and palette.
  - Use **Copy refinement prompt** and **Export source image**, then import a result.
  - Browser API keys do not activate the private refinement relay. Keep live paid
    requests parked until separately approved.

- End with one full example concept:
  - Save a prompt pack.
  - Add two AI result variants.
  - Mark one variant as **Best**.
  - Add style tags.
  - Confirm artist matches are visible.
  - This single card demonstrates most of the recent AI workflow.
