use std::io;
use std::fs;

fn main() {
    println!("please enter your gemini api key below:");

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();

    let api_key = input.trim();

    let content = format!(
        "GEMINI_API_KEY={}\n",
        api_key
    );

    fs::write("backend/.env", content).expect("Failed to write .env");
}