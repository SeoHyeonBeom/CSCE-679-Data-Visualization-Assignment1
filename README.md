# CSCE-679-Data-Visualization-Assignment1

## How to Run

1. Open a terminal in the project folder.
2. Start a local web server:

	```bash
	python3 -m http.server 8000
	```

3. Open the following URL in a web browser:

	[http://localhost:8000](http://localhost:8000)

4. Stop the server with `Ctrl+C` when finished.

> The project should be run through a local web server because the visualization loads data from `temperature_daily.csv`.

## How to Use

- **Level 1: Heatmap** shows monthly temperatures for all available years.
- **Level 2: Daily lines** shows daily maximum and minimum temperature lines for the most recent years.
- Use the temperature buttons to switch between maximum and minimum temperature.
- Hover over a cell to see the date and temperature values in a tooltip.
- In Level 2, move the mouse horizontally across a cell to inspect individual daily values.