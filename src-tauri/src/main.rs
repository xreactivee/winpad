#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if winpad_lib::cli() {
        return;
    }
    winpad_lib::run()
}
