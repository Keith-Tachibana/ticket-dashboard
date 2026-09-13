# Ticket dashboard SPFx web part

This is the application source for a web part, not a full SPFx project —
the build toolchain files (gulpfile, tsconfig, webpack config, etc.) are
version-pinned and best generated fresh by the official scaffolder rather
than hand-copied.

## Getting a project to drop this into

```
nvm use 22          # SPFx 1.21+ requires Node 22 LTS
npm install -g yo @microsoft/generator-sharepoint
mkdir ticket-dashboard && cd ticket-dashboard
yo @microsoft/sharepoint
```

Answer the prompts: solution name, "WebPart" as the component type, "React"
as the framework, and name the web part `TicketDashboard`.

## Where these files go

The generator creates `src/webparts/ticketDashboard/` (matching whatever
name you gave it). Overwrite the generated `TicketDashboardWebPart.ts` and
`components/` folder with the files here — keep the generated
`TicketDashboardWebPart.manifest.json` and everything outside `src/`
as the generator made them.

## Wiring it up

1. `npm install` in the generated project.
2. Start the local dev server: `heft start` if there's no `gulpfile.js`
   in your project root (SPFx 1.22+), or `gulp serve` if there is one
   (SPFx 1.21.x or older). Test against the SharePoint workbench first.
3. Add the web part to a page, open its property pane, and fill in:
   - **Proxy base URL**: `https://<your-site>.netlify.app/.netlify/functions/ninja`
   - **Proxy shared key**: the `PROXY_SHARED_KEY` value you set on the
     Netlify proxy
4. Once it renders tickets correctly in the workbench, package and deploy.
   Check whether your project has a `gulpfile.js` in the root:
   - **No gulpfile.js (SPFx 1.22+, Heft toolchain):**
     `heft build --production` then `heft package-solution --production`
   - **Has gulpfile.js (SPFx 1.21.x or older, Gulp toolchain):**
     `gulp bundle --ship` then `gulp package-solution --ship`

   Either way, upload the resulting `.sppkg` (in `sharepoint/solution/`) to
   your tenant App Catalog.

## Note on the proxy shared key

It's sent as a header from the browser, which means it's visible to anyone
who opens dev tools on the page — same as it would be with any client-side
call to a keyed API. It's meaningfully less sensitive than the NinjaOne
client secret (it only unlocks this proxy, and you can rotate it any time
by changing `PROXY_SHARED_KEY`), but it's still worth treating as
semi-sensitive — don't post it anywhere public, and rotate it if you
suspect it's leaked.
