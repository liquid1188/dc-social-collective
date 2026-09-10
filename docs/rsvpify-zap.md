# Sending RSVPify events to the editor

RSVPify has no RSS or calendar feed of your events, so nothing can be imported
from it on a schedule. What it does have is Zapier. This is the one-time setup
that makes a new RSVPify event show up in the editor as a draft you can finish.

Nothing here can publish a night on its own. Every event that arrives this way
lands with the **Draft** switch on, which keeps it off the site, out of the
listings, and out of the events feed until you turn that switch off yourself.

## 1. Make a token

1. On GitHub, go to Settings, then Developer settings, then Personal access
   tokens, then Fine-grained tokens.
2. Generate a new token. Give it a name like `zapier-rsvpify`, set the
   expiration you want, and under Repository access pick only
   `liquid1188/dc-social-collective`.
3. Under Repository permissions set **Contents** to Read and write. Nothing
   else is needed.
4. Copy the token. GitHub shows it once.

## 2. Make the Zap

1. Trigger: RSVPify, New Event.
2. Action: **Webhooks by Zapier**, Custom Request.
   - Method: `POST`
   - URL: `https://api.github.com/repos/liquid1188/dc-social-collective/dispatches`
   - Data (paste this, then swap the values in quotes for the RSVPify fields
     Zapier offers you):

     ```json
     {
       "event_type": "rsvpify-event",
       "client_payload": {
         "title": "Event Name",
         "date": "Event Start",
         "venue": "Venue Name",
         "address": "Venue Address",
         "tickets": "Event URL"
       }
     }
     ```

   - Headers:

     | Header | Value |
     | --- | --- |
     | `Accept` | `application/vnd.github+json` |
     | `Authorization` | `Bearer YOUR_TOKEN` |
     | `User-Agent` | `zapier` |

3. Turn the Zap on.

## What the payload can carry

Only `title` and `date` are required. Everything else fills in a field in the
editor if you send it, and is left empty if you do not.

| Key | Goes to | Notes |
| --- | --- | --- |
| `title` | Event name | Also names the file. |
| `date` | Date of the night | `2026-11-07`, or a full timestamp. |
| `time` | Start time | Taken from the timestamp if you do not send it. |
| `end` | End time | |
| `venue` | Venue | |
| `address` | Address | |
| `series` | Series | Must match a series in the editor, or it becomes Special events. |
| `tickets` | Ticket link | The RSVPify link. |
| `description` | Description | Placeholder text if you do not send it. |

Sending the same event twice does nothing the second time. The draft file is
left exactly as you left it, so a Zap that fires again cannot overwrite your
edits.

## Testing it without Zapier

In the repository, open Actions, pick **Draft event from RSVPify**, press Run
workflow, and paste something like this into the box:

```json
{"title":"Test night","date":"2026-12-05","venue":"Nowhere"}
```

A draft appears in the editor under Events. Delete it when you are done.
