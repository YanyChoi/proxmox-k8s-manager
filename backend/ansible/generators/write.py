import string

def generate_file(template_path: str, generated_path: str, replacements: str) -> None:
    with open(template_path, 'r') as f:
        template = string.Template(f.read())
        with open(generated_path, 'w') as g:
            g.write(template.substitute(replacements))