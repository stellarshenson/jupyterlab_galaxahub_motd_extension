"""The authoring skill beside the CLI skill (docs/acc-crit.md, ACC-AUTHOR-86)."""
import re
import runpy
import tomllib
from pathlib import Path

ROOT = Path(__file__).parents[2]
NAME = "jupyterlab-galaxahub-motd-authoring"
SKILL = ROOT / ".agents" / "skills" / NAME


def test_name_equals_its_directory():
    lines = (SKILL / "SKILL.md").read_text().splitlines()
    assert lines[0] == "---"
    frontmatter = lines[1:lines.index("---", 1)]
    assert f"name: {NAME}" in frontmatter
    assert any(line.startswith("description: ") for line in frontmatter)


def test_skill_links_every_reference_and_every_link_resolves():
    references = sorted(path.name for path in (SKILL / "references").glob("*.md"))
    assert references == ["content-policy.md", "html-package.md", "images-and-sound.md", "markdown.md"]
    linked = re.findall(r"\]\((references/[^)]+)\)", (SKILL / "SKILL.md").read_text())
    assert sorted({Path(link).name for link in linked}) == references
    for page in SKILL.rglob("*.md"):
        for link in re.findall(r"\]\(([^)#:]+)\)", page.read_text()):
            assert (page.parent / link).is_file(), f"{page.name} links {link}"


def test_wheel_installs_it_beside_the_cli_skill():
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    shared = pyproject["tool"]["hatch"]["build"]["targets"]["wheel"]["shared-data"]
    assert shared[f".agents/skills/{NAME}"] == f"share/jupyter/agents/skills/{NAME}"


def test_check_server_serves_the_standard_policy():
    # the header content-policy.md says the hub serves is the one scripts/serve.py sends
    served = re.search(r"The hub then serves:\n\n```\n(.+)\n```",
                       (SKILL / "references" / "content-policy.md").read_text()).group(1)
    # run_path writes no bytecode: a __pycache__ in the skill folder would ship in the wheel
    # (DEF-TEST-31)
    assert runpy.run_path(str(SKILL / "scripts" / "serve.py"))["POLICY"] == served


def test_skill_folder_holds_no_bytecode():
    # the wheel copies the whole folder, ignored files included (DEF-TEST-31)
    assert not [path.name for path in SKILL.rglob("*.pyc")]
