# ordis

phone first coding ide. open it on ur android phone, edit any file in ur repo, hit run and it actually compiles/runs python, cpp or js right there. theres also an locally hosted ai agent (gemini here for demo purposed) that can edit ur code for u if u just ask, a real terminal thats connected to ur actual project folder, and speech to text so u can talk to the agent instead of typing everything out. all of this runs fully on device thru termux, no cloud backend, no external server.

built for the iqoo hackathon, this is the phase 1 idea.

## running it on android

everything happens inside termux.

### 1. install termux

- get termux from f-droid or play-store (fdroid preferably)

### 2. install everything termux needs

```
pkg update && pkg upgrade
pkg install python clang nodejs git rust termux-api
```

- python -> runs python code(working version on test -> 3.13.13)
- clang -> compiles cpp (clang++)
- nodejs -> runs js code
- rust -> only needed once, to build the secret.rs setup script
- termux-api -> needed for the speech to text mic feature (grant mic permission when it asks the first time)

### 3. clone the repo

```
git clone https://github.com/ayushsucksaf/ordis
cd ordis
```

### 4. install python packages

```
pip install -r requirements.txt
```

### 5. set up ur gemini api key

theres a secret.rs file that just asks for ur gemini api key and writes it into a .env file for u so u dont have to make it by hand.

```
rustc secret.rs
./secret
```

it'll ask u for the key, paste it in, done. .env file gets created automatically after this.

### 6. run the backend

```
uvicorn backend/main:app --reload
```

### 7. open it

go to

```
http://127.0.0.1:8000
```
on any browser (untested on firefox based browsers).

The demo mobile IDE (editor, runner, live terminal, AI agent, and git manager) will load directly with zero extra setup.