# Face Matcher

Face Recognition web app using [@vladmandic/face-api](https://github.com/vladmandic/face-api) fork of [face-api.js](https://github.com/justadudewhohacks/face-api.js)

## Installation

install dependencies

```bash
npm install
```

rename `.env.example` to `.env` and fill in the values, you can ignore any `DATABASE_` variables and fill in straight to `DATABASE_URL`

but change `prisma/schema.prisma` provider accordingly (currently using mysql (see [supported databases](https://www.prisma.io/docs/reference/database-reference/supported-databases))) before running the following commands

```bash
npx prisma db push

npm run build
```

download the [models](https://github.com/vladmandic/face-api/tree/master/model) and put them in `models` folder

## Usage

use supervisor or pm2 to make sure the app is always running, or use `npm run start` to run the app once

## API Endpoints

### `GET /ping`

ping the server to check if it's running

### `POST /register`

register a new image to the database, the request body should be a form-data with the following fields:

- `id`: the id of the image(s) to be registered, id can be used again to register another image of the same person
- `file`: the image file to be registered, can be multiple files

### `POST /match`

match an image to the database, the request body should be a form-data with the following fields:

- `file`: the image file to be matched, unlike `/register`, this endpoint only accept one file
- `id`: (OPTIONAL) the id of the image to be matched against the uploaded `file`.

### `GET /complaint/:requestId/:changeTo`

create a complaint to the system in case of false match, the request params should be:

- `requestId`: the id of the request, returned by `/match` endpoint
- `changeTo`: the correct id of the actual person in the image sent
