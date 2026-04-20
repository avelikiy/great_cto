"""Tiny click-based CLI — deliberate problems for great_cto tests."""

import click
import requests


@click.command()
@click.argument("url")
def main(url: str) -> None:
    # TODO: validate input
    try:
        response = requests.get(url, timeout=5)
        click.echo(response.text[:200])
    except:  # noqa: E722 — deliberate bare except for pipeline test
        click.echo("request failed")


if __name__ == "__main__":
    main()
